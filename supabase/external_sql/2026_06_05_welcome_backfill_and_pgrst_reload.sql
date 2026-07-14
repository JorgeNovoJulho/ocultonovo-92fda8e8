-- =========================================================================
-- 2026-06-05 — Hotfix duplo:
--   A) Recarrega o schema cache do PostgREST para que o RPC
--      `aura_xp_interaction_charge` volte a ser reconhecido (toast
--      "Economia de XP indisponível" some).
--   B) Backfill de boas-vindas: garante que TODO usuário humano sem
--      registro em oculto_welcome_message_log receba a mensagem agora,
--      cobrindo casos em que o trigger AFTER INSERT/UPDATE perdeu o
--      evento (ex.: @donperidon660). Idempotente.
-- Pré-requisitos já existentes no banco externo:
--   - public.send_welcome_message_to_user(uuid, boolean)
--   - public.oculto_welcome_message_log (PK em user_id)
--   - public.profiles (com is_seed)
-- =========================================================================

-- A) Refresh imediato do schema cache (resolve PGRST202 do aura_xp_interaction_charge)
NOTIFY pgrst, 'reload schema';

-- B) Backfill — envia welcome para todo humano com username válido sem log
DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.user_id
      FROM public.profiles p
     WHERE p.user_id IS NOT NULL
       AND COALESCE(p.is_seed, false) = false
       AND NULLIF(btrim(p.username), '') IS NOT NULL
       AND lower(btrim(p.username)) NOT IN ('usuario','usuário','user')
       AND NOT EXISTS (
         SELECT 1 FROM public.oculto_welcome_message_log l
          WHERE l.user_id = p.user_id
       )
     ORDER BY p.created_at DESC NULLS LAST
     LIMIT 1000
  LOOP
    BEGIN
      PERFORM public.send_welcome_message_to_user(r.user_id, false);
    EXCEPTION WHEN others THEN
      -- nunca quebra o lote
      NULL;
    END;
  END LOOP;
END
$backfill$;

-- Garante que o trigger AFTER UPDATE OF username está ativo (no-op se já existe)
DO $ensure_trg$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'profiles_send_welcome_on_username_ready'
       AND tgrelid = 'public.profiles'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER profiles_send_welcome_on_username_ready
             AFTER UPDATE OF username ON public.profiles
             FOR EACH ROW
             EXECUTE FUNCTION public.trg_send_welcome_on_username_ready()';
  END IF;
END
$ensure_trg$;

NOTIFY pgrst, 'reload schema';
