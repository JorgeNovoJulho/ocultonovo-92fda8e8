-- =====================================================================
-- Subcontas ASAAS automáticas (oculto_asaas_subaccounts)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente. Não quebra profiles.asaas_wallet_id existente.
-- =====================================================================

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.oculto_asaas_subaccounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id        UUID NOT NULL UNIQUE,           -- profiles.user_id
  asaas_account_id  TEXT,
  wallet_id         TEXT,
  api_key_encrypted TEXT,                            -- chave da subconta (nunca exposta ao client)
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | active | rejected | suspended
  kyc_status        TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  onboarding_url    TEXT,
  income_value      NUMERIC(12,2),
  raw_response      JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Índices
CREATE INDEX IF NOT EXISTS idx_oculto_asaas_subaccounts_status
  ON public.oculto_asaas_subaccounts (status);
CREATE INDEX IF NOT EXISTS idx_oculto_asaas_subaccounts_kyc
  ON public.oculto_asaas_subaccounts (kyc_status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_oculto_asaas_subaccounts_wallet
  ON public.oculto_asaas_subaccounts (wallet_id) WHERE wallet_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_oculto_asaas_subaccounts_account
  ON public.oculto_asaas_subaccounts (asaas_account_id) WHERE asaas_account_id IS NOT NULL;

-- 3) Trigger updated_at
CREATE OR REPLACE FUNCTION public.oculto_asaas_subaccounts_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_oculto_asaas_subaccounts_touch ON public.oculto_asaas_subaccounts;
CREATE TRIGGER trg_oculto_asaas_subaccounts_touch
  BEFORE UPDATE ON public.oculto_asaas_subaccounts
  FOR EACH ROW EXECUTE FUNCTION public.oculto_asaas_subaccounts_touch();

-- 4) RLS
ALTER TABLE public.oculto_asaas_subaccounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Criador vê APENAS sua subconta (sem api_key — nunca selecionada via RPC abaixo)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='oculto_asaas_subaccounts' AND policyname='subacc_owner_select') THEN
    CREATE POLICY subacc_owner_select ON public.oculto_asaas_subaccounts
      FOR SELECT USING (creator_id = auth.uid());
  END IF;

  -- Admin Master vê tudo
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='oculto_asaas_subaccounts' AND policyname='subacc_master_all') THEN
    CREATE POLICY subacc_master_all ON public.oculto_asaas_subaccounts
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM information_schema.routines
           WHERE routine_schema='public' AND routine_name='aura_is_master_admin'
        ) AND public.aura_is_master_admin()
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM information_schema.routines
           WHERE routine_schema='public' AND routine_name='aura_is_master_admin'
        ) AND public.aura_is_master_admin()
      );
  END IF;
END $$;

-- 5) View segura (sem api_key) — frontend usa esta
CREATE OR REPLACE VIEW public.v_oculto_asaas_subaccount_safe AS
SELECT
  id, creator_id, asaas_account_id, wallet_id,
  status, kyc_status, onboarding_url, income_value,
  last_error, created_at, updated_at
FROM public.oculto_asaas_subaccounts;

GRANT SELECT ON public.v_oculto_asaas_subaccount_safe TO authenticated;

-- 6) RPC: buscar minha subconta (somente campos seguros)
CREATE OR REPLACE FUNCTION public.oculto_get_my_asaas_subaccount()
RETURNS TABLE (
  id UUID, asaas_account_id TEXT, wallet_id TEXT,
  status TEXT, kyc_status TEXT, onboarding_url TEXT,
  last_error TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT id, asaas_account_id, wallet_id, status, kyc_status,
         onboarding_url, last_error, created_at, updated_at
    FROM public.oculto_asaas_subaccounts
   WHERE creator_id = auth.uid()
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.oculto_get_my_asaas_subaccount() TO authenticated;

-- 7) Migração suave: importa walletIds que já estão em profiles
INSERT INTO public.oculto_asaas_subaccounts (creator_id, wallet_id, status, kyc_status, raw_response)
SELECT p.user_id, p.asaas_wallet_id, 'active', 'approved',
       jsonb_build_object('imported_from','profiles','at', now())
  FROM public.profiles p
 WHERE p.asaas_wallet_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.oculto_asaas_subaccounts s WHERE s.creator_id = p.user_id
   )
ON CONFLICT (creator_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
