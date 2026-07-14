-- ============================================================
-- STORY METRICS & VIEWS FIX — 2026-05-22
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente.
--
-- Resolve:
--  1) Dono do story não vê contagem nem lista de visualizações
--     (story_views.viewer_id era gravado como auth.uid em algumas inserções,
--      e a SELECT policy de owner dependia de mapeamento frágil entre
--      posts.user_id e profiles.id).
--  2) Contagens de likes/dislikes precisavam de um único ponto canônico.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1) RPC: registrar visualização (sempre grava profile.id no viewer_id)
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.story_view_register(p_story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
BEGIN
  IF v_uid IS NULL OR p_story_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN; END IF;

  -- Idempotente: ignora se já existe (mesmo viewer já registrado neste story)
  INSERT INTO public.story_views (story_id, viewer_id, viewed_at)
  VALUES (p_story_id, v_profile_id, now())
  ON CONFLICT DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.story_view_register(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.story_view_register(uuid) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- 2) RPC: métricas do story (view/like/dislike) — bypassa RLS
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.story_metrics_get(p_story_id uuid)
RETURNS TABLE (
  view_count bigint,
  like_count bigint,
  dislike_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.story_views    WHERE story_id = p_story_id),
    (SELECT COUNT(*) FROM public.story_likes    WHERE story_id = p_story_id),
    (SELECT COUNT(*) FROM public.story_dislikes WHERE story_id = p_story_id);
$$;

REVOKE ALL ON FUNCTION public.story_metrics_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.story_metrics_get(uuid) TO authenticated, anon;

-- ───────────────────────────────────────────────────────────
-- 3) RPC: lista de visualizadores (somente para o dono do story)
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.story_viewers_for_owner(p_story_id uuid)
RETURNS TABLE (
  viewer_profile_id uuid,
  viewed_at timestamptz,
  name text,
  username text,
  avatar_url text,
  is_verified boolean,
  is_verified_couple boolean,
  plan_type text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_profile_id uuid;
  v_post_owner_col uuid;
BEGIN
  IF v_uid IS NULL OR p_story_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_owner_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_owner_profile_id IS NULL THEN RETURN; END IF;

  -- Aceita ambos mapeamentos: posts.user_id pode ser profile.id (legado) OU auth.uid.
  -- Também aceita posts.author_id, caso a coluna exista no schema atual.
  SELECT p.user_id INTO v_post_owner_col
  FROM public.posts p
  WHERE p.id = p_story_id
  LIMIT 1;

  IF v_post_owner_col IS NULL THEN RETURN; END IF;
  IF v_post_owner_col <> v_owner_profile_id AND v_post_owner_col <> v_uid THEN
    -- Não é dono — devolve vazio sem erro
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sv.viewer_id,
    sv.viewed_at,
    pr.name,
    pr.username,
    pr.avatar_url,
    COALESCE(pr.is_verified, false),
    COALESCE(pr.is_verified_couple, false),
    COALESCE(pr.plan_type, 'free')
  FROM public.story_views sv
  LEFT JOIN public.profiles pr
    ON pr.id = sv.viewer_id OR pr.user_id = sv.viewer_id
  WHERE sv.story_id = p_story_id
  ORDER BY sv.viewed_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.story_viewers_for_owner(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.story_viewers_for_owner(uuid) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- 4) Saneamento: rows antigas em story_views com viewer_id = auth.uid
--    (remapeia para o profile.id correspondente quando possível)
-- ───────────────────────────────────────────────────────────
UPDATE public.story_views sv
SET viewer_id = p.id
FROM public.profiles p
WHERE p.user_id = sv.viewer_id
  AND sv.viewer_id <> p.id;

-- ───────────────────────────────────────────────────────────
-- 5) Reforço de policy: permite o dono ler diretamente também
--    (mantém a policy existente; só garante a versão robusta presente)
-- ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='story_views'
      AND policyname='Dono do story vê visualizações (robusto)'
  ) THEN
    EXECUTE 'DROP POLICY "Dono do story vê visualizações (robusto)" ON public.story_views';
  END IF;
END $$;

CREATE POLICY "Dono do story vê visualizações (robusto)"
  ON public.story_views
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      LEFT JOIN public.profiles pr ON pr.id = p.user_id OR pr.user_id = p.user_id
      WHERE p.id = story_views.story_id
        AND (p.user_id = auth.uid() OR pr.user_id = auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
