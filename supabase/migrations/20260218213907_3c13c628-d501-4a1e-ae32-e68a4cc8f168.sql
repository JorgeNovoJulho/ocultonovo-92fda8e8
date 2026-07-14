
-- Add asaas_wallet_id to profiles so each creator can configure their own split destination
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS asaas_wallet_id TEXT DEFAULT NULL;

-- Index for fast lookups during PIX generation
CREATE INDEX IF NOT EXISTS idx_profiles_asaas_wallet_id
  ON public.profiles (asaas_wallet_id)
  WHERE asaas_wallet_id IS NOT NULL;
