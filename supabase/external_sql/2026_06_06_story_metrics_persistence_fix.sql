-- ============================================================
-- STORY METRICS — PERSISTÊNCIA DOS CONTADORES (2026-06-06)
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente.
--
-- Problema:
--   View count sempre 0 porque story_view_register (versão 2026-05-30)
--   inserts INTO public.story_views (story_id, viewer_profile_id)
--   mas a tabela real do banco usa a coluna `viewer_id`.
--   O CREATE TABLE IF NOT EXISTS não altera schema existente → o INSERT
--   falha silenciosamente dentro do RETURNING jsonb e o contador nunca sobe.
--
--   Likes/dislikes também ficavam zerados quando story_metrics_get
--   tentava ler tabelas com schema parcial.
--
-- Correção:
--   1) Normaliza schema de story_views (garante story_id, viewer_id, viewed_at + PK).
--   2) Reescreve story_view_register para detectar a coluna correta em runtime
--      e SEMPRE inserir com sucesso (idempotente via ON CONFLICT).
--   3) Garante story_likes/story_dislikes com (story_id, user_id) UNIQUE.
--   4) Reescreve story_metrics_get robusto: usa to_regclass + escolhe coluna
--      de viewer dinamicamente.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1) Normalização de schema (não destrutivo)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

-- Se a tabela legada usou viewer_profile_id, espelhar em viewer_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='story_views' AND column_name='viewer_profile_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='story_views' AND column_name='viewer_id') THEN
    EXECUTE 'ALTER TABLE public.story_views RENAME COLUMN viewer_profile_id TO viewer_id';
  END IF;
END $$;

-- Garante coluna viewer_id mesmo em tabelas legadas com nome diferente
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='story_views' AND column_name='viewer_id') THEN
    ALTER TABLE public.story_views ADD COLUMN viewer_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='story_views' AND column_name='viewed_at') THEN
    ALTER TABLE public.story_views ADD COLUMN viewed_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- PK / UNIQUE idempotente (story_id, viewer_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.story_views'::regclass
      AND contype IN ('p','u')
      AND pg_get_constraintdef(oid) ILIKE '%(story_id, viewer_id)%'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.story_views ADD CONSTRAINT story_views_story_viewer_uniq UNIQUE (story_id, viewer_id)';
    EXCEPTION WHEN OTHERS THEN
      -- Pode existir índice equivalente; ignora
      NULL;
    END;
  END IF;
END $$;

GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_views' AND policyname='story_views_insert_any_auth') THEN
    EXECUTE 'CREATE POLICY "story_views_insert_any_auth" ON public.story_views FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_views' AND policyname='story_views_select_auth') THEN
    EXECUTE 'CREATE POLICY "story_views_select_auth" ON public.story_views FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────
-- 2) story_likes / story_dislikes — garantir schema mínimo
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

GRANT SELECT, INSERT, DELETE ON public.story_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.story_dislikes TO authenticated;
GRANT ALL ON public.story_likes TO service_role;
GRANT ALL ON public.story_dislikes TO service_role;

-- ───────────────────────────────────────────────────────────
-- 3) story_view_register — robusto a schemas legados
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.story_view_register(p_story_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_inserted int := 0;
  v_col text;
BEGIN
  IF v_uid IS NULL OR p_story_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated_or_no_story');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_profile_id IS NULL THEN
    SELECT id INTO v_profile_id FROM public.profiles WHERE id = v_uid LIMIT 1;
  END IF;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  -- Detecta coluna do viewer (viewer_id padrão; viewer_profile_id em schemas legados)
  SELECT column_name INTO v_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='story_views'
    AND column_name IN ('viewer_id','viewer_profile_id')
  ORDER BY CASE column_name WHEN 'viewer_id' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_col IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_viewer_column');
  END IF;

  EXECUTE format(
    'INSERT INTO public.story_views (story_id, %I) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    v_col
  ) USING p_story_id, v_profile_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted > 0);
END $$;

REVOKE ALL ON FUNCTION public.story_view_register(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.story_view_register(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────
-- 4) story_metrics_get — leitura robusta
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
  v_views bigint := 0;
  v_likes bigint := 0;
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
-- 5) Saneamento: viewer_id que ficou como auth.uid → profile.id
-- ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='story_views' AND column_name='viewer_id') THEN
    EXECUTE $sql$
      UPDATE public.story_views sv
      SET viewer_id = p.id
      FROM public.profiles p
      WHERE p.user_id = sv.viewer_id
        AND sv.viewer_id <> p.id
    $sql$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
