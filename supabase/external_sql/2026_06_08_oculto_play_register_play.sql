-- ============================================================
-- Oculto Play — contador de reproduções (sem limite por usuário)
-- Toda vez que alguém tocar uma música/vídeo, soma +1 em view_count.
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.oculto_play_register_play(p_item_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF p_item_id IS NULL THEN RETURN 0; END IF;
  IF NOT public.can_access_oculto_play() THEN RETURN 0; END IF;

  UPDATE public.oculto_play_items
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = p_item_id
  RETURNING view_count INTO v_count;

  RETURN COALESCE(v_count, 0);
END
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_register_play(uuid) TO authenticated;
