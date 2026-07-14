-- ============================================================================
-- AURA PULSE — Fix room identity por slug (schema externo)
-- Corrige erro "column \"id\" does not exist" ao enviar pulso.
-- A tabela public.oculto_aura_rooms usa slug como PK, não id.
-- Este patch valida a sala por slug e gera um UUID estável derivado do slug,
-- compatível com o frontend para pulsos / ressonância / highlight.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.aura_pulse_send_by_slug(
  p_room_slug  text,
  p_target_id  uuid,
  p_message_id uuid DEFAULT NULL,
  p_pulse_type text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
  v_slug text;
  v_hash text;
BEGIN
  IF p_room_slug IS NULL OR length(trim(p_room_slug)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_required', 'server_now', now());
  END IF;

  v_slug := lower(trim(p_room_slug));

  PERFORM 1
    FROM public.oculto_aura_rooms
   WHERE slug = v_slug
     AND active = true
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found', 'slug', v_slug, 'server_now', now());
  END IF;

  v_hash := encode(digest('oculto-aura-room:' || v_slug, 'sha256'), 'hex');
  v_room_id := (
    substr(v_hash, 1, 8) || '-' ||
    substr(v_hash, 9, 4) || '-' ||
    substr(v_hash, 13, 4) || '-' ||
    substr(v_hash, 17, 4) || '-' ||
    substr(v_hash, 21, 12)
  )::uuid;

  RETURN public.aura_pulse_send(v_room_id, p_target_id, p_message_id, p_pulse_type);
END;
$$;

REVOKE ALL ON FUNCTION public.aura_pulse_send_by_slug(text, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_pulse_send_by_slug(text, uuid, uuid, text) TO authenticated;