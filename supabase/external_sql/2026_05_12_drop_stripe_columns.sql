-- 2026_05_12_drop_stripe_columns.sql
-- Remove fisicamente colunas Stripe legadas. Pagamentos 100% ASAAS.
-- Idempotente: usa IF EXISTS em todas operações.

BEGIN;

-- Plataforma
ALTER TABLE IF EXISTS public.oculto_platform_plans
  DROP COLUMN IF EXISTS stripe_product_id,
  DROP COLUMN IF EXISTS stripe_price_id_monthly,
  DROP COLUMN IF EXISTS stripe_price_id_annual;

-- Profiles
ALTER TABLE IF EXISTS public.profiles
  DROP COLUMN IF EXISTS stripe_customer_id;

-- Bidder cards (leilões)
ALTER TABLE IF EXISTS public.bidder_cards
  DROP COLUMN IF EXISTS stripe_payment_method_id;

-- Limpeza opcional: remover linhas stripe_* de system_settings
DELETE FROM public.system_settings WHERE key LIKE 'stripe_%';

COMMIT;
