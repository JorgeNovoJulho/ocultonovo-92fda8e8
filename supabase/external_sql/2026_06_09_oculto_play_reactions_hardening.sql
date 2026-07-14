-- ============================================================================
-- OCULTO PLAY — Hardening das RPCs de reações (corrige "Não consegui registrar sua reação")
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. Não toca tabelas existentes.
-- Causa raiz: ambiguidade do identificador `count` (OUT param vs alias na SELECT),
-- e necessidade de garantir GRANT/search_path/SECURITY DEFINER consistentes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.oculto_play_react(
  p_item_id uuid,
  p_emoji   text
) RETURNS TABLE(emoji text, count bigint, mine boolean)
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
  IF NOT public.can_access_oculto_play() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  IF p_emoji NOT IN ('heart','fire','wow','clap','laugh') THEN
    RAISE EXCEPTION 'invalid emoji';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.oculto_play_reactions
    WHERE item_id = p_item_id AND user_id = v_uid AND emoji = p_emoji
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.oculto_play_reactions
    WHERE item_id = p_item_id AND user_id = v_uid AND emoji = p_emoji;
  ELSE
    INSERT INTO public.oculto_play_reactions(item_id, user_id, emoji)
    VALUES (p_item_id, v_uid, p_emoji)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    r.emoji::text                       AS emoji,
    COUNT(*)::bigint                    AS count,
    BOOL_OR(r.user_id = v_uid)          AS mine
  FROM public.oculto_play_reactions r
  WHERE r.item_id = p_item_id
  GROUP BY r.emoji
  ORDER BY COUNT(*) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_react(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_reactions_for_items(
  p_item_ids uuid[]
) RETURNS TABLE(item_id uuid, emoji text, count bigint, mine boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.can_access_oculto_play() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  SELECT
    r.item_id                           AS item_id,
    r.emoji::text                       AS emoji,
    COUNT(*)::bigint                    AS count,
    BOOL_OR(r.user_id = v_uid)          AS mine
  FROM public.oculto_play_reactions r
  WHERE r.item_id = ANY(p_item_ids)
  GROUP BY r.item_id, r.emoji
  ORDER BY r.item_id, COUNT(*) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_reactions_for_items(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
