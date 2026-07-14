-- =====================================================================
-- 2026-05-25 — Correção definitiva de posts invisíveis no perfil
-- V3 compatível com schemas legados que podem TER ou NÃO TER posts.user_id
--
-- Objetivos:
-- 1) Normalizar posts legados para o profile canônico mais recente.
-- 2) Corrigir creator_id/author_id quando essas colunas existirem.
-- 3) Reforçar as RLS policies sem depender rigidamente de posts.user_id.
-- 4) Expor diagnóstico final sem quebrar em schemas diferentes.
--
-- Idempotente. Rodar inteiro no SQL Editor do Supabase EXTERNO.
-- =====================================================================

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 1) Corrige creator_id quando a coluna existe
-- ---------------------------------------------------------------------
DO $fix_creator$
DECLARE
  has_creator_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'creator_id'
  ) INTO has_creator_id;

  IF has_creator_id THEN
    EXECUTE $sql$
      WITH canonical_profiles AS (
        SELECT DISTINCT ON (p.user_id)
          p.user_id AS auth_user_id,
          p.id AS canonical_profile_id
        FROM public.profiles p
        WHERE p.user_id IS NOT NULL
        ORDER BY p.user_id, p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST, p.id DESC
      ),
      owner_map AS (
        SELECT
          p.id AS post_id,
          COALESCE(
            cp_by_creator.auth_user_id,
            cp_by_author.auth_user_id,
            pr_author.user_id,
            pr_creator.user_id,
            NULLIF(to_jsonb(p)->>'creator_id', '')::uuid
          ) AS auth_user_id
        FROM public.posts p
        LEFT JOIN public.profiles pr_author
          ON pr_author.id::text = to_jsonb(p)->>'author_id'
        LEFT JOIN public.profiles pr_creator
          ON pr_creator.id::text = to_jsonb(p)->>'creator_id'
        LEFT JOIN canonical_profiles cp_by_creator
          ON cp_by_creator.auth_user_id::text = to_jsonb(p)->>'creator_id'
        LEFT JOIN canonical_profiles cp_by_author
          ON cp_by_author.canonical_profile_id::text = to_jsonb(p)->>'author_id'
      )
      UPDATE public.posts p
      SET creator_id = om.auth_user_id
      FROM owner_map om
      WHERE p.id = om.post_id
        AND om.auth_user_id IS NOT NULL
        AND (to_jsonb(p)->>'creator_id') IS DISTINCT FROM om.auth_user_id::text
    $sql$;
  END IF;
END
$fix_creator$;

-- ---------------------------------------------------------------------
-- 2) Corrige author_id quando author_id + creator_id existem
-- ---------------------------------------------------------------------
DO $fix_author$
DECLARE
  has_author_id boolean;
  has_creator_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'author_id'
  ) INTO has_author_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'creator_id'
  ) INTO has_creator_id;

  IF has_author_id AND has_creator_id THEN
    EXECUTE $sql$
      WITH canonical_profiles AS (
        SELECT DISTINCT ON (pr.user_id)
          pr.user_id AS auth_user_id,
          pr.id AS canonical_profile_id
        FROM public.profiles pr
        WHERE pr.user_id IS NOT NULL
        ORDER BY pr.user_id, pr.updated_at DESC NULLS LAST, pr.created_at DESC NULLS LAST, pr.id DESC
      ),
      canonical_author AS (
        SELECT
          p.id AS post_id,
          cp.canonical_profile_id
        FROM public.posts p
        JOIN canonical_profiles cp
          ON cp.auth_user_id::text = to_jsonb(p)->>'creator_id'
      )
      UPDATE public.posts p
      SET author_id = ca.canonical_profile_id
      FROM canonical_author ca
      WHERE p.id = ca.post_id
        AND ca.canonical_profile_id IS NOT NULL
        AND (to_jsonb(p)->>'author_id') IS DISTINCT FROM ca.canonical_profile_id::text
    $sql$;
  END IF;
END
$fix_author$;

-- ---------------------------------------------------------------------
-- 3) Policies defensivas para o próprio dono sempre enxergar seus posts
--    Compatível com posts.user_id ausente.
-- ---------------------------------------------------------------------
DO $policies$
DECLARE
  has_user_id boolean;
  has_author_id boolean;
  has_creator_id boolean;
  owner_clause text := 'FALSE';
  select_clause text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'user_id'
  ) INTO has_user_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'author_id'
  ) INTO has_author_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'creator_id'
  ) INTO has_creator_id;

  IF has_creator_id THEN
    owner_clause := owner_clause || ' OR auth.uid() = creator_id';
  END IF;

  IF has_user_id THEN
    owner_clause := owner_clause || ' OR EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = public.posts.user_id
        AND pr.user_id = auth.uid()
    )';
  END IF;

  IF has_author_id THEN
    owner_clause := owner_clause || ' OR EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = public.posts.author_id
        AND pr.user_id = auth.uid()
    )';
  END IF;

  select_clause := '(
      COALESCE(is_hidden, false) = false
      AND COALESCE(privacy_level, ''public'') = ''public''
    ) OR (' || owner_clause || ')';

  EXECUTE 'DROP POLICY IF EXISTS "posts_select_public" ON public.posts';
  EXECUTE 'CREATE POLICY "posts_select_public" ON public.posts FOR SELECT USING (' || select_clause || ')';

  EXECUTE 'DROP POLICY IF EXISTS "posts_update_own" ON public.posts';
  EXECUTE 'CREATE POLICY "posts_update_own" ON public.posts FOR UPDATE TO authenticated USING (' || owner_clause || ') WITH CHECK (' || owner_clause || ')';

  EXECUTE 'DROP POLICY IF EXISTS "posts_delete_own" ON public.posts';
  EXECUTE 'CREATE POLICY "posts_delete_own" ON public.posts FOR DELETE TO authenticated USING (' || owner_clause || ')';

  EXECUTE 'DROP POLICY IF EXISTS "posts_insert_own" ON public.posts';
  EXECUTE 'CREATE POLICY "posts_insert_own" ON public.posts FOR INSERT TO authenticated WITH CHECK (' || owner_clause || ')';
END
$policies$;

-- ---------------------------------------------------------------------
-- 4) Diagnóstico final seguro para schemas diferentes
-- ---------------------------------------------------------------------
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'posts'
  AND column_name IN ('user_id', 'author_id', 'creator_id')
ORDER BY column_name;

SELECT
  COALESCE(to_jsonb(p)->>'creator_id', '(null)') AS creator_id,
  COUNT(*) AS total_posts,
  COUNT(*) FILTER (
    WHERE NULLIF(to_jsonb(p)->>'author_id', '') IS NOT NULL
      AND pr.id IS NULL
  ) AS author_id_orfao,
  COUNT(*) FILTER (
    WHERE NULLIF(to_jsonb(p)->>'creator_id', '') IS NOT NULL
      AND pr.user_id::text IS DISTINCT FROM to_jsonb(p)->>'creator_id'
  ) AS author_creator_mismatch
FROM public.posts p
LEFT JOIN public.profiles pr
  ON pr.id::text = to_jsonb(p)->>'author_id'
GROUP BY COALESCE(to_jsonb(p)->>'creator_id', '(null)')
ORDER BY total_posts DESC
LIMIT 20;

SELECT
  pr.username,
  pr.id AS profile_id,
  pr.user_id AS auth_user_id,
  COUNT(p.id) AS total_posts
FROM public.profiles pr
LEFT JOIN public.posts p
  ON pr.id::text = COALESCE(
    NULLIF(to_jsonb(p)->>'author_id', ''),
    NULLIF(to_jsonb(p)->>'user_id', '')
  )
GROUP BY pr.username, pr.id, pr.user_id, pr.updated_at
ORDER BY total_posts DESC, pr.updated_at DESC NULLS LAST
LIMIT 50;

NOTIFY pgrst, 'reload schema';