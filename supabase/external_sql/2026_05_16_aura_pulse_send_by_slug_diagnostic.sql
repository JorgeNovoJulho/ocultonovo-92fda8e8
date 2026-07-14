-- ============================================================================
-- AURA PULSE — Diagnóstico do RPC e blindagem de colunas
--
-- 1) Garante (idempotente) que `aura_pulses` tem `pulse_type`, `expires_at` e
--    `metadata` — fonte mais provável do erro "column \"id\" does not exist"
--    é o INSERT ... RETURNING id falhar porque o INSERT em si referencia
--    uma coluna inexistente (a mensagem do PG cita a primeira coluna do tuple).
-- 2) Redefine `aura_pulse_send_by_slug` envolvendo a chamada do RPC interno
--    em EXCEPTION para retornar SQLSTATE + SQLERRM + CONTEXT — assim o
--    painel "Pulso · Debug (Master)" no chat passa a mostrar exatamente
--    qual statement falhou.
-- 100% idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Reforço de schema --------------------------------------------------------
ALTER TABLE public.aura_pulses
  ADD COLUMN IF NOT EXISTS pulse_type text        NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aura_pulses_pulse_type_check'
  ) THEN
    ALTER TABLE public.aura_pulses
      ADD CONSTRAINT aura_pulses_pulse_type_check
      CHECK (pulse_type IN ('default','premium','rare','silent'));
  END IF;
END$$;

-- 2) Wrapper com diagnóstico --------------------------------------------------
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
  v_slug    text;
  v_hash    text;
  v_result  jsonb;
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
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found',
      'slug', v_slug, 'server_now', now());
  END IF;

  v_hash := encode(digest('oculto-aura-room:' || v_slug, 'sha256'), 'hex');
  v_room_id := (
    substr(v_hash, 1, 8)  || '-' ||
    substr(v_hash, 9, 4)  || '-' ||
    substr(v_hash, 13, 4) || '-' ||
    substr(v_hash, 17, 4) || '-' ||
    substr(v_hash, 21, 12)
  )::uuid;

  BEGIN
    v_result := public.aura_pulse_send(v_room_id, p_target_id, p_message_id, p_pulse_type);
    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    -- Surface error to client so the diagnostic panel can show exactly where
    -- the failure happened (SQLSTATE + message + context line).
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'rpc_internal',
      'sqlstate', SQLSTATE,
      'message',  SQLERRM,
      'context',  COALESCE(NULLIF(substr(COALESCE(pg_exception_context(),''), 1, 500), ''), ''),
      'slug',     v_slug,
      'room_id',  v_room_id,
      'pulse_type', p_pulse_type,
      'server_now', now()
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.aura_pulse_send_by_slug(text, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_pulse_send_by_slug(text, uuid, uuid, text) TO authenticated;
