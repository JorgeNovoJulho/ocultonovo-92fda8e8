-- =====================================================================
-- 2026-05-27 — FIX: ambiguidade em toggle_special_reaction / list_special_reactions
-- "column reference 'reaction' is ambiguous"
-- Causa: o RETURNS TABLE expõe uma coluna chamada `reaction` que colide
-- com a coluna `reaction` da tabela creator_special_reactions nas
-- subqueries internas.
-- Solução: qualificar todas as referências com alias da tabela.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.toggle_special_reaction(
  p_post_id  uuid,
  p_reaction text
)
RETURNS TABLE (
  reaction text,
  total    bigint,
  active   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF p_reaction NOT IN ('fire','diamond','crown','sparkle') THEN
    RAISE EXCEPTION 'invalid reaction';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.creator_special_reactions csr
    WHERE csr.post_id = p_post_id
      AND csr.user_id = v_uid
      AND csr.reaction = p_reaction
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.creator_special_reactions csr
    WHERE csr.post_id = p_post_id
      AND csr.user_id = v_uid
      AND csr.reaction = p_reaction;
  ELSE
    INSERT INTO public.creator_special_reactions (post_id, user_id, reaction)
    VALUES (p_post_id, v_uid, p_reaction);
  END IF;

  RETURN QUERY
  SELECT
    p_reaction AS reaction,
    (SELECT COUNT(*)::bigint FROM public.creator_special_reactions csr
       WHERE csr.post_id = p_post_id AND csr.reaction = p_reaction) AS total,
    (NOT v_exists) AS active;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_special_reaction(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_special_reactions(p_post_id uuid)
RETURNS TABLE (
  reaction text,
  total    bigint,
  mine     boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT unnest(ARRAY['fire','diamond','crown','sparkle']) AS r
  )
  SELECT
    b.r AS reaction,
    COALESCE((SELECT COUNT(*)::bigint FROM public.creator_special_reactions csr
              WHERE csr.post_id = p_post_id AND csr.reaction = b.r), 0) AS total,
    EXISTS(SELECT 1 FROM public.creator_special_reactions csr
           WHERE csr.post_id = p_post_id
             AND csr.reaction = b.r
             AND csr.user_id = auth.uid()) AS mine
  FROM base b;
$$;

GRANT EXECUTE ON FUNCTION public.list_special_reactions(uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
