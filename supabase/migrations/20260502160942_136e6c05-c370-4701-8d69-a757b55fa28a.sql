
-- Default Modo Conexão = true para novos perfis
ALTER TABLE public.profiles ALTER COLUMN connection_mode SET DEFAULT true;

-- Backfill: ativa Modo Conexão para usuários existentes que ainda não definiram
UPDATE public.profiles SET connection_mode = true WHERE connection_mode IS DISTINCT FROM true;

-- Garantir default true para WhatsApp opt-in (já era true, idempotente) e backfill
ALTER TABLE public.profiles ALTER COLUMN whatsapp_promotions_opt_in SET DEFAULT true;
UPDATE public.profiles SET whatsapp_promotions_opt_in = true WHERE whatsapp_promotions_opt_in IS NULL;

-- Default accept_super_dm = false (Free não pode receber por padrão).
-- Mantemos true só para usuários Premium/VIP existentes; Free volta para false.
ALTER TABLE public.profiles ALTER COLUMN accept_super_dm SET DEFAULT false;
UPDATE public.profiles
  SET accept_super_dm = CASE
    WHEN plan_type IN ('premium','monthly','vip') THEN true
    ELSE false
  END
WHERE accept_super_dm IS NULL OR (accept_super_dm = true AND plan_type NOT IN ('premium','monthly','vip'));
