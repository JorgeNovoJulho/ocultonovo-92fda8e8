-- =====================================================================
-- FIX: community reactions — aceitar QUALQUER emoji (estilo WhatsApp)
-- Remove o filtro IN ('like','love','fire','laugh','wow','sad') das RPCs
-- de resumo. Mantém compat: emojis e códigos legados convivem; a
-- normalização final é feita no frontend (LEGACY_REACTION_TO_EMOJI).
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.community_topic_reactions_summary(
  _topic_ids uuid[]
) RETURNS TABLE (
  topic_id uuid,
  reaction text,
  total bigint,
  mine boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.topic_id,
    r.reaction,
    COUNT(*)::bigint AS total,
    BOOL_OR(r.user_id = auth.uid()) AS mine
  FROM public.oculto_community_reactions r
  WHERE r.topic_id = ANY(_topic_ids)
  GROUP BY r.topic_id, r.reaction;
$$;

GRANT EXECUTE ON FUNCTION public.community_topic_reactions_summary(uuid[]) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.community_reply_reactions_summary(
  _reply_ids uuid[]
) RETURNS TABLE (
  reply_id uuid,
  reaction text,
  total bigint,
  mine boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.reply_id,
    r.reaction,
    COUNT(*)::bigint AS total,
    BOOL_OR(r.user_id = auth.uid()) AS mine
  FROM public.oculto_community_reactions r
  WHERE r.reply_id = ANY(_reply_ids)
  GROUP BY r.reply_id, r.reaction;
$$;

GRANT EXECUTE ON FUNCTION public.community_reply_reactions_summary(uuid[]) TO authenticated, anon;
