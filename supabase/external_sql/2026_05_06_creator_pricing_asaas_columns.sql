-- =====================================================================
-- Garante creator_pricing_config + colunas Asaas (idempotente)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- =====================================================================

-- 1) Tabela base (caso ainda não exista no banco externo)
CREATE TABLE IF NOT EXISTS public.creator_pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_per_message NUMERIC(10,2),
  price_per_photo NUMERIC(10,2),
  price_per_video NUMERIC(10,2),
  subscription_enabled BOOLEAN DEFAULT false,
  subscription_monthly NUMERIC(10,2),
  subscription_annual NUMERIC(10,2),
  subscription_lifetime NUMERIC(10,2),
  super_dm_enabled BOOLEAN DEFAULT false,
  super_dm_min_price NUMERIC(10,2),
  auction_starting_price NUMERIC(10,2),
  auction_min_increment NUMERIC(10,2),
  platform_fee_pct NUMERIC(5,2) DEFAULT 20,
  tax_reserve_pct NUMERIC(5,2) DEFAULT 6,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.creator_pricing_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='creator_pricing_config' AND policyname='cpc_owner_all') THEN
    CREATE POLICY cpc_owner_all ON public.creator_pricing_config
      FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
END $$;

-- 2) Colunas Asaas
ALTER TABLE public.creator_pricing_config
  ADD COLUMN IF NOT EXISTS asaas_api_key TEXT,
  ADD COLUMN IF NOT EXISTS asaas_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_connection_status TEXT,
  ADD COLUMN IF NOT EXISTS asaas_last_test_at TIMESTAMPTZ;

-- 3) Espelho asaas_wallet_id em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS asaas_wallet_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_asaas_wallet_id
  ON public.profiles (asaas_wallet_id)
  WHERE asaas_wallet_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
