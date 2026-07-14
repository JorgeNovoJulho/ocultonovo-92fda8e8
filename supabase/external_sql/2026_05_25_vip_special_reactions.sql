-- =====================================================================
-- VIP Special Reactions (🔥 💎 👑 ✨)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Tabela ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_special_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  reaction    text NOT NULL CHECK (reaction IN ('fire','diamond','crown','sparkle')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_csr_post     ON public.creator_special_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_csr_user     ON public.creator_special_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_csr_post_rea ON public.creator_special_reactions(post_id, reaction);

-- 2) RLS ------------------------------------------------------------------
ALTER TABLE public.creator_special_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csr_select_all   ON public.creator_special_reactions;
DROP POLICY IF EXISTS csr_insert_self  ON public.creator_special_reactions;
DROP POLICY IF EXISTS csr_delete_self  ON public.creator_special_reactions;

CREATE POLICY csr_select_all
  ON public.creator_special_reactions
  FOR SELECT
  USING (true);

CREATE POLICY csr_insert_self
  ON public.creator_special_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY csr_delete_self
  ON public.creator_special_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- 3) RPC: toggle ----------------------------------------------------------
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
    SELECT 1 FROM public.creator_special_reactions
    WHERE post_id = p_post_id AND user_id = v_uid AND reaction = p_reaction
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.creator_special_reactions
    WHERE post_id = p_post_id AND user_id = v_uid AND reaction = p_reaction;
  ELSE
    INSERT INTO public.creator_special_reactions (post_id, user_id, reaction)
    VALUES (p_post_id, v_uid, p_reaction);
  END IF;

  RETURN QUERY
  SELECT p_reaction,
         (SELECT COUNT(*) FROM public.creator_special_reactions
            WHERE post_id = p_post_id AND reaction = p_reaction),
         NOT v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_special_reaction(uuid,text) TO authenticated;

-- 4) RPC: list contagens por post ----------------------------------------
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
    SELECT unnest(ARRAY['fire','diamond','crown','sparkle']) AS reaction
  )
  SELECT
    b.reaction,
    COALESCE((SELECT COUNT(*) FROM public.creator_special_reactions
              WHERE post_id = p_post_id AND reaction = b.reaction), 0) AS total,
    EXISTS(SELECT 1 FROM public.creator_special_reactions
           WHERE post_id = p_post_id AND reaction = b.reaction
             AND user_id = auth.uid()) AS mine
  FROM base b;
$$;

GRANT EXECUTE ON FUNCTION public.list_special_reactions(uuid) TO authenticated, anon;
