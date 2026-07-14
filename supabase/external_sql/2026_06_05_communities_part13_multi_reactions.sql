-- =====================================================================
-- Comunidades — Parte 13: Multi-reactions em tópicos e replies
-- Reações suportadas: like(👍), love(❤️), fire(🔥), laugh(😂), wow(😮), sad(😢)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Summary por TÓPICOS (batch) -----------------------------------------
CREATE OR REPLACE FUNCTION public.community_topic_reactions_summary(
  _topic_ids uuid[]
)
RETURNS TABLE (
  topic_id uuid,
  reaction text,
  total    bigint,
  mine     boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    r.topic_id,
    r.reaction,
    COUNT(*)::bigint AS total,
    bool_or(r.user_id = auth.uid()) AS mine
  FROM public.oculto_community_reactions r
  WHERE r.topic_id = ANY(_topic_ids)
    AND r.reaction IN ('like','love','fire','laugh','wow','sad')
  GROUP BY r.topic_id, r.reaction;
$$;

GRANT EXECUTE ON FUNCTION public.community_topic_reactions_summary(uuid[]) TO authenticated, anon;

-- 2) Summary por REPLIES (batch) -----------------------------------------
CREATE OR REPLACE FUNCTION public.community_reply_reactions_summary(
  _reply_ids uuid[]
)
RETURNS TABLE (
  reply_id uuid,
  reaction text,
  total    bigint,
  mine     boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    r.reply_id,
    r.reaction,
    COUNT(*)::bigint AS total,
    bool_or(r.user_id = auth.uid()) AS mine
  FROM public.oculto_community_reactions r
  WHERE r.reply_id = ANY(_reply_ids)
    AND r.reaction IN ('like','love','fire','laugh','wow','sad')
  GROUP BY r.reply_id, r.reaction;
$$;

GRANT EXECUTE ON FUNCTION public.community_reply_reactions_summary(uuid[]) TO authenticated, anon;
