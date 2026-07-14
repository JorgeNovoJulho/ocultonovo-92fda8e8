-- ============================================================
-- STORY METRICS + ATTENTION HISTORY — FIX v2 (2026-05-22)
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente.
--
-- Resolve:
--  1) story_metrics_get falhava com "relation public.story_likes does not exist"
--     em schemas antigos. Agora as tabelas são criadas se faltarem, e a função
--     usa to_regclass para nunca quebrar.
--  2) aura_attention_history retornava "column reference 'id' is ambiguous"
--     porque a RETURNS TABLE declara `id`, que conflita com colunas de tabelas
--     no corpo. Resolvido com `#variable_conflict use_column`.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1) Tabelas auxiliares de story_likes / story_dislikes
--    (criadas só se não existirem)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.story_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.story_dislikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);

ALTER TABLE public.story_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_dislikes ENABLE ROW LEVEL SECURITY;

-- Policies idempotentes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_likes' AND policyname='read own story_likes') THEN
    CREATE POLICY "read own story_likes" ON public.story_likes
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = story_likes.user_id AND p.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_likes' AND policyname='insert own story_likes') THEN
    CREATE POLICY "insert own story_likes" ON public.story_likes
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = story_likes.user_id AND p.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_likes' AND policyname='delete own story_likes') THEN
    CREATE POLICY "delete own story_likes" ON public.story_likes
      FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = story_likes.user_id AND p.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_dislikes' AND policyname='read own story_dislikes') THEN
    CREATE POLICY "read own story_dislikes" ON public.story_dislikes
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = story_dislikes.user_id AND p.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_dislikes' AND policyname='insert own story_dislikes') THEN
    CREATE POLICY "insert own story_dislikes" ON public.story_dislikes
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = story_dislikes.user_id AND p.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_dislikes' AND policyname='delete own story_dislikes') THEN
    CREATE POLICY "delete own story_dislikes" ON public.story_dislikes
      FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = story_dislikes.user_id AND p.user_id = auth.uid()));
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────
-- 2) story_metrics_get — robusto a schemas parciais
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.story_metrics_get(p_story_id uuid)
RETURNS TABLE (
  view_count bigint,
  like_count bigint,
  dislike_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_views    bigint := 0;
  v_likes    bigint := 0;
  v_dislikes bigint := 0;
BEGIN
  IF p_story_id IS NULL THEN
    view_count := 0; like_count := 0; dislike_count := 0;
    RETURN NEXT; RETURN;
  END IF;

  IF to_regclass('public.story_views') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.story_views WHERE story_id = $1'
      INTO v_views USING p_story_id;
  END IF;

  IF to_regclass('public.story_likes') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.story_likes WHERE story_id = $1'
      INTO v_likes USING p_story_id;
  END IF;

  IF to_regclass('public.story_dislikes') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.story_dislikes WHERE story_id = $1'
      INTO v_dislikes USING p_story_id;
  END IF;

  view_count := v_views;
  like_count := v_likes;
  dislike_count := v_dislikes;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.story_metrics_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.story_metrics_get(uuid) TO authenticated, anon;

-- ───────────────────────────────────────────────────────────
-- 3) aura_attention_history — corrige "column reference id is ambiguous"
--    `#variable_conflict use_column` faz o plpgsql resolver nomes ambíguos
--    como colunas (não como out-params de RETURNS TABLE).
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aura_attention_history(
  p_direction text DEFAULT 'all',
  p_limit int DEFAULT 50,
  p_before timestamptz DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  direction text,
  other_user_id uuid,
  other_username text,
  other_name text,
  other_avatar text,
  room_id uuid,
  pulse_type text,
  status text,
  created_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_has_pulses   boolean := to_regclass('public.aura_pulses') IS NOT NULL;
  v_has_settings boolean := to_regclass('public.aura_pulse_settings') IS NOT NULL;
  v_has_prefs    boolean := to_regclass('public.aura_pulse_user_preferences') IS NOT NULL;
  v_has_blocks   boolean := to_regclass('public.blocked_contacts') IS NOT NULL;
  v_history_enabled boolean := true;
  v_retention int := 30;
  v_max int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_save_history boolean := true;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF v_has_settings THEN
    SELECT
      COALESCE(s.history_enabled, true),
      COALESCE(s.history_retention_days, 30),
      LEAST(GREATEST(COALESCE(p_limit, 50), 1), COALESCE(s.history_max_rows, 200))
    INTO v_history_enabled, v_retention, v_max
    FROM public.aura_pulse_settings s
    WHERE s.id = true;
  END IF;

  IF NOT COALESCE(v_history_enabled, true) THEN
    RETURN;
  END IF;

  IF v_has_prefs THEN
    SELECT COALESCE(up.save_attention_history, true)
      INTO v_save_history
    FROM public.aura_pulse_user_preferences up
    WHERE up.user_id = v_uid;

    IF COALESCE(v_save_history, true) = false THEN
      RETURN;
    END IF;
  END IF;

  IF v_has_pulses THEN
    RETURN QUERY
    SELECT
      p.id,
      CASE WHEN p.sender_id = v_uid THEN 'sent' ELSE 'received' END,
      CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END,
      pr.username,
      COALESCE(pr.name, pr.display_name, pr.username),
      pr.avatar_url,
      p.room_id,
      p.pulse_type,
      p.status,
      p.created_at,
      p.responded_at,
      p.expires_at
    FROM public.aura_pulses p
    LEFT JOIN public.profiles pr
      ON pr.user_id = CASE WHEN p.sender_id = v_uid THEN p.target_id ELSE p.sender_id END
    WHERE (p.sender_id = v_uid OR p.target_id = v_uid)
      AND p.status <> 'blocked'
      AND p.created_at > now() - make_interval(days => COALESCE(v_retention, 30))
      AND (p_before IS NULL OR p.created_at < p_before)
      AND (
        p_direction = 'all'
        OR (p_direction = 'received' AND p.target_id = v_uid)
        OR (p_direction = 'sent'     AND p.sender_id = v_uid)
        OR (p_direction = 'responded' AND p.status = 'responded')
        OR (p_direction = 'expired'   AND p.status = 'sent' AND p.expires_at IS NOT NULL AND p.expires_at < now())
      )
    ORDER BY p.created_at DESC
    LIMIT v_max;
    RETURN;
  END IF;

  IF to_regclass('public.oculto_aura_attentions') IS NOT NULL THEN
    RETURN QUERY
    SELECT
      a.id,
      CASE WHEN a.sender_id = v_uid THEN 'sent' ELSE 'received' END,
      CASE WHEN a.sender_id = v_uid THEN a.target_id ELSE a.sender_id END,
      pr.username,
      COALESCE(pr.display_name, pr.name, pr.username),
      pr.avatar_url,
      NULL::uuid,
      'default'::text,
      'sent'::text,
      a.created_at,
      NULL::timestamptz,
      NULL::timestamptz
    FROM public.oculto_aura_attentions a
    LEFT JOIN public.profiles pr
      ON pr.user_id = CASE WHEN a.sender_id = v_uid THEN a.target_id ELSE a.sender_id END
    WHERE (a.sender_id = v_uid OR a.target_id = v_uid)
      AND (p_before IS NULL OR a.created_at < p_before)
      AND (
        p_direction = 'all'
        OR (p_direction = 'received' AND a.target_id = v_uid)
        OR (p_direction = 'sent'     AND a.sender_id = v_uid)
      )
    ORDER BY a.created_at DESC
    LIMIT v_max;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.aura_attention_history(text, int, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
