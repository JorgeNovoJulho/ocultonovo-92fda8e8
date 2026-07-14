-- 2026_05_12_deprecate_stripe_settings.sql
-- Marca chaves stripe_* como deprecated em system_settings.
-- Idempotente. NÃO remove dados — apenas anota deprecação para auditoria.
-- Pagamentos passam a ser 100% ASAAS (PIX + cartão).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='system_settings') THEN
    UPDATE public.system_settings
       SET value = jsonb_build_object(
             'deprecated', true,
             'deprecated_at', now(),
             'reason', 'Migração para ASAAS 100% (PIX + cartão)',
             'previous_value', value
           )
     WHERE key LIKE 'stripe_%'
       AND (value->>'deprecated') IS DISTINCT FROM 'true';
  END IF;
END $$;

-- Opcional (revisar antes de rodar): zera flag global se existir.
-- UPDATE public.system_settings SET value = '"false"'::jsonb WHERE key = 'stripe_enabled';
