-- ============================================================================
-- AURA PULSE — Fix definitivo do erro "function digest(text, unknown) does not exist"
--
-- Causa-raiz: `pgcrypto` instala suas funções no schema `extensions` no
-- Supabase. O RPC `aura_pulse_send_by_slug` rodava com
-- `SET search_path = public`, então `digest(...)` não era resolvido.
--
-- Correção:
--  1) Garantir extensão pgcrypto (qualquer schema).
--  2) Incluir `extensions` no search_path do RPC.
--  3) Chamar `extensions.digest(...)` com cast explícito `::bytea` para evitar
--     a ambiguidade da assinatura `digest(text, unknown)`.
--  4) Manter wrapper de EXCEPTION para diagnóstico no painel master.
--
-- 100% idempotente. Executar no SQL Editor do Supabase EXTERNO.
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
SET search_path = public, extensions
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

  -- Cast explícito para bytea evita o erro
  -- "function digest(text, unknown) does not exist" (42883)
  v_hash := encode(
    extensions.digest(('oculto-aura-room:' || v_slug)::bytea, 'sha256'),
    'hex'
  );

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

NOTIFY pgrst, 'reload schema';
