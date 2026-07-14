-- ============================================================================
-- Retenção dos Canais VIP — read progress, posts fixados, toggles e analytics
-- Idempotente. Aplicar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) Posts fixados ------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_author_pinned
  ON public.posts (author_id, is_pinned DESC, pinned_at DESC)
  WHERE is_pinned IS TRUE;

-- 2) Progresso de leitura -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_content_read_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  creator_id      UUID NOT NULL,
  post_id         UUID NOT NULL,
  section_type    TEXT,
  progress_percent INTEGER NOT NULL DEFAULT 0
    CHECK (progress_percent BETWEEN 0 AND 100),
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_read_progress_user_creator
  ON public.creator_content_read_progress (user_id, creator_id, last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_read_progress_user_recent
  ON public.creator_content_read_progress (user_id, last_read_at DESC)
  WHERE progress_percent < 95;

ALTER TABLE public.creator_content_read_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rp_own_select ON public.creator_content_read_progress;
CREATE POLICY rp_own_select ON public.creator_content_read_progress
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS rp_own_insert ON public.creator_content_read_progress;
CREATE POLICY rp_own_insert ON public.creator_content_read_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS rp_own_update ON public.creator_content_read_progress;
CREATE POLICY rp_own_update ON public.creator_content_read_progress
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS rp_own_delete ON public.creator_content_read_progress;
CREATE POLICY rp_own_delete ON public.creator_content_read_progress
  FOR DELETE USING (auth.uid() = user_id);

-- Owner do canal pode ver agregados de quem leu o que (anonimizado via view)
DROP POLICY IF EXISTS rp_creator_select ON public.creator_content_read_progress;
CREATE POLICY rp_creator_select ON public.creator_content_read_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = creator_content_read_progress.creator_id
        AND (p.user_id = auth.uid() OR p.id = auth.uid())
    )
  );

-- RPC: upsert idempotente do progresso (chamado pelo viewer narrativo)
CREATE OR REPLACE FUNCTION public.upsert_read_progress(
  p_post_id UUID,
  p_creator_id UUID,
  p_section_type TEXT,
  p_progress_percent INTEGER
)
RETURNS public.creator_content_read_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.creator_content_read_progress;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_post_id IS NULL OR p_creator_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_PARAMS';
  END IF;

  INSERT INTO public.creator_content_read_progress
    (user_id, creator_id, post_id, section_type, progress_percent, last_read_at)
  VALUES
    (v_uid, p_creator_id, p_post_id, p_section_type,
     GREATEST(0, LEAST(100, COALESCE(p_progress_percent, 0))), NOW())
  ON CONFLICT (user_id, post_id) DO UPDATE
    SET progress_percent = GREATEST(creator_content_read_progress.progress_percent,
                                    EXCLUDED.progress_percent),
        section_type     = COALESCE(EXCLUDED.section_type, creator_content_read_progress.section_type),
        last_read_at     = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_read_progress(UUID, UUID, TEXT, INTEGER) TO authenticated;

-- RPC: lista "Continue lendo" do usuário num canal específico (ou geral)
CREATE OR REPLACE FUNCTION public.list_continue_reading(
  p_creator_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 6
)
RETURNS TABLE (
  post_id UUID,
  creator_id UUID,
  section_type TEXT,
  progress_percent INTEGER,
  last_read_at TIMESTAMPTZ,
  title TEXT,
  teaser TEXT,
  thumbnail_url TEXT,
  read_time_minutes INTEGER,
  series_title TEXT,
  chapter_number INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT rp.post_id, rp.creator_id, rp.section_type, rp.progress_percent,
         rp.last_read_at, p.title, p.teaser, p.thumbnail_url,
         p.read_time_minutes, p.series_title, p.chapter_number
  FROM public.creator_content_read_progress rp
  JOIN public.posts p ON p.id = rp.post_id
  WHERE rp.user_id = auth.uid()
    AND rp.progress_percent BETWEEN 5 AND 94
    AND (p_creator_id IS NULL OR rp.creator_id = p_creator_id)
  ORDER BY rp.last_read_at DESC
  LIMIT COALESCE(p_limit, 6);
$$;

GRANT EXECUTE ON FUNCTION public.list_continue_reading(UUID, INTEGER) TO authenticated;

-- 3) Toggles do Canal VIP em platform_runtime_settings -----------------------
ALTER TABLE public.platform_runtime_settings
  ADD COLUMN IF NOT EXISTS vip_narrative_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vip_continue_reading_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vip_pin_enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vip_special_reactions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vip_schedule_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vip_share_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vip_analytics_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vip_feed_cards_enabled        BOOLEAN NOT NULL DEFAULT TRUE;

-- 4) Recria v_feed_posts garantindo is_pinned/pinned_at e narrativos --------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_feed_posts'
  ) THEN
    DROP VIEW public.v_feed_posts CASCADE;
  END IF;
END $$;

CREATE VIEW public.v_feed_posts
WITH (security_invoker = true) AS
SELECT
  p.*
FROM public.posts p
WHERE COALESCE(p.is_hidden, FALSE) = FALSE;

GRANT SELECT ON public.v_feed_posts TO anon, authenticated;

-- 5) Analytics agregadas do criador (Canal VIP) ------------------------------
CREATE OR REPLACE FUNCTION public.creator_channel_analytics(p_creator_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_owner BOOLEAN;
  v_profile_id UUID;
  v_user_id UUID;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT p.id, p.user_id INTO v_profile_id, v_user_id
  FROM public.profiles p
  WHERE p.id = p_creator_id OR p.user_id = p_creator_id
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'CREATOR_NOT_FOUND';
  END IF;

  v_is_owner := (v_user_id = v_uid OR v_profile_id = v_uid);
  IF NOT v_is_owner THEN
    -- master admin pode ver também
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = v_uid AND COALESCE(is_master_admin, FALSE) = TRUE
    ) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
  END IF;

  WITH posts_base AS (
    SELECT id, section_type, is_pinned, content_format
    FROM public.posts WHERE author_id = v_profile_id
  ),
  reads AS (
    SELECT section_type, COUNT(*) AS reads_total,
           AVG(progress_percent)::INT AS avg_progress,
           COUNT(*) FILTER (WHERE progress_percent >= 95) AS completed
    FROM public.creator_content_read_progress
    WHERE creator_id = v_profile_id
    GROUP BY section_type
  ),
  top_posts AS (
    SELECT p.id, p.title, p.section_type,
           COUNT(rp.id) AS reads_count,
           COALESCE(AVG(rp.progress_percent)::INT, 0) AS avg_progress
    FROM public.posts p
    LEFT JOIN public.creator_content_read_progress rp ON rp.post_id = p.id
    WHERE p.author_id = v_profile_id
      AND p.content_format = 'narrative'
    GROUP BY p.id
    ORDER BY reads_count DESC NULLS LAST, p.created_at DESC
    LIMIT 10
  ),
  beta_grants AS (
    SELECT grant_type, COUNT(*) AS total
    FROM public.beta_access_grants
    WHERE creator_id = v_profile_id
      AND COALESCE(is_active, TRUE) = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
    GROUP BY grant_type
  ),
  real_subs AS (
    SELECT COUNT(*) AS total
    FROM public.subscriptions
    WHERE (creator_id = v_profile_id OR creator_user_id = v_user_id)
      AND status IN ('active', 'trialing')
  )
  SELECT jsonb_build_object(
    'reads_by_section', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'section_type', section_type,
        'reads_total', reads_total,
        'avg_progress', avg_progress,
        'completed', completed)) FROM reads), '[]'::jsonb),
    'top_narratives', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'section_type', section_type,
        'reads_count', reads_count, 'avg_progress', avg_progress)) FROM top_posts), '[]'::jsonb),
    'beta_paid_grants', COALESCE((SELECT total FROM beta_grants WHERE grant_type='paid_content'), 0),
    'beta_sub_grants',  COALESCE((SELECT total FROM beta_grants WHERE grant_type='creator_subscription'), 0),
    'real_subscriptions', COALESCE((SELECT total FROM real_subs), 0),
    'pinned_count', (SELECT COUNT(*) FROM posts_base WHERE is_pinned IS TRUE),
    'narrative_count', (SELECT COUNT(*) FROM posts_base WHERE content_format = 'narrative')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.creator_channel_analytics(UUID) TO authenticated;

-- ============================================================================
-- FIM
-- ============================================================================
