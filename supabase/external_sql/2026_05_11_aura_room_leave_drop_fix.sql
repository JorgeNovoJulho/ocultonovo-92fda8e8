-- ============================================================
-- FIX: cannot change return type of existing function aura_room_leave(text)
-- Causa: existia uma versão anterior dessa função com tipo de retorno diferente.
-- Solução: DROP + recriar com retorno jsonb e promoção do próximo da fila.
-- Idempotente — pode rodar quantas vezes for necessário.
-- ============================================================

DROP FUNCTION IF EXISTS public.aura_room_leave(text) CASCADE;
DROP FUNCTION IF EXISTS public.aura_room_leave_all() CASCADE;

-- 1) LEAVE de uma sala específica + promove próximo da fila ----------
CREATE OR REPLACE FUNCTION public.aura_room_leave(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_next uuid;
  v_room public.oculto_aura_rooms;
  v_removed int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  -- Remove presença do usuário nessa sala
  WITH del AS (
    DELETE FROM public.oculto_aura_room_presence
     WHERE room_slug = p_slug AND user_id = v_uid
     RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM del;

  -- Tira da fila se estava esperando
  DELETE FROM public.oculto_aura_room_waitlist
   WHERE room_slug = p_slug AND user_id = v_uid;

  SELECT * INTO v_room FROM public.oculto_aura_rooms WHERE slug = p_slug;

  -- Promove próximo da fila criando uma slot offer (TTL 60s gerenciado pelo listener)
  SELECT user_id INTO v_next
    FROM public.oculto_aura_room_waitlist
   WHERE room_slug = p_slug
   ORDER BY enqueued_at ASC
   LIMIT 1;

  IF v_next IS NOT NULL AND v_room.slug IS NOT NULL THEN
    INSERT INTO public.oculto_aura_room_slot_offers(room_slug, room_name, hue, user_id)
    VALUES (p_slug, v_room.name, v_room.hue, v_next);
  END IF;

  RETURN jsonb_build_object('ok', true, 'removed', v_removed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_leave(text) TO authenticated;

-- 2) LEAVE de TODAS as salas (single-room enforcement client-side) ----
CREATE OR REPLACE FUNCTION public.aura_room_leave_all()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  WITH del AS (
    DELETE FROM public.oculto_aura_room_presence
     WHERE user_id = v_uid
     RETURNING room_slug
  )
  SELECT count(*) INTO v_count FROM del;

  DELETE FROM public.oculto_aura_room_waitlist WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'left', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_leave_all() TO authenticated;
