-- ============================================================
-- AUDITORIA P1+P2+P3 — Correções consolidadas (2026-05-08)
-- VERSÃO 2 — sem duplicar a RPC de split (já existe process_payment_split)
-- Idempotente. Cole no SQL Editor do Supabase externo.
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- 1) Remover duplicata da RPC criada por engano na rodada anterior
DROP FUNCTION IF EXISTS public.process_oculto_payment_split(uuid,text,uuid,uuid,decimal,uuid);

-- 2) Garantir colunas intro_* em subscription_plans (trailer VIP ≤90s)
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS intro_kind text CHECK (intro_kind IN ('video','image','gif')),
  ADD COLUMN IF NOT EXISTS intro_url text,
  ADD COLUMN IF NOT EXISTS intro_poster text,
  ADD COLUMN IF NOT EXISTS intro_duration_seconds int;

CREATE OR REPLACE FUNCTION public.enforce_intro_duration()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.intro_kind = 'video'
     AND NEW.intro_duration_seconds IS NOT NULL
     AND NEW.intro_duration_seconds > 90 THEN
    RAISE EXCEPTION 'Trailer VIP deve ter no máximo 90 segundos';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_intro_duration ON public.subscription_plans;
CREATE TRIGGER trg_enforce_intro_duration
  BEFORE INSERT OR UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_intro_duration();

-- 3) Config dinâmica + limite de afiliação
CREATE TABLE IF NOT EXISTS public.platform_finance_config (
  id text PRIMARY KEY DEFAULT 'singleton',
  tax_pct decimal(5,2) NOT NULL DEFAULT 6.00,
  platform_pct decimal(5,2) NOT NULL DEFAULT 20.00,
  affiliate_pct decimal(5,2) NOT NULL DEFAULT 5.00,
  affiliate_max_creators_per_user int NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_row CHECK (id = 'singleton')
);
INSERT INTO public.platform_finance_config (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_finance_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_read_finance_config" ON public.platform_finance_config;
CREATE POLICY "anyone_read_finance_config" ON public.platform_finance_config
  FOR SELECT TO authenticated USING (true);

-- 4) Limite de afiliações (consulta a payment_splits, que é o log do split engine)
CREATE OR REPLACE FUNCTION public.affiliate_can_add_creator(
  p_affiliate_id uuid, p_creator_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_limit int; v_count int;
BEGIN
  IF p_affiliate_id = p_creator_id THEN RETURN false; END IF;
  SELECT affiliate_max_creators_per_user INTO v_limit FROM public.platform_finance_config WHERE id = 'singleton';
  -- payment_splits é a fonte canônica do log do split engine existente
  SELECT count(DISTINCT creator_id) INTO v_count
  FROM public.payment_splits WHERE affiliate_id = p_affiliate_id;
  IF EXISTS (
    SELECT 1 FROM public.payment_splits
    WHERE affiliate_id = p_affiliate_id AND creator_id = p_creator_id
  ) THEN RETURN true; END IF;
  RETURN v_count < COALESCE(v_limit, 3);
END $$;
GRANT EXECUTE ON FUNCTION public.affiliate_can_add_creator(uuid,uuid) TO authenticated, service_role;

-- 5) Paywall conversion logs
CREATE TABLE IF NOT EXISTS public.paywall_conversion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  trigger text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  converted boolean NOT NULL DEFAULT false,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paywall_logs_user ON public.paywall_conversion_logs(user_id, created_at DESC);
ALTER TABLE public.paywall_conversion_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_insert_own_paywall_log" ON public.paywall_conversion_logs;
CREATE POLICY "user_insert_own_paywall_log" ON public.paywall_conversion_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
DROP POLICY IF EXISTS "service_role_all_paywall_log" ON public.paywall_conversion_logs;
CREATE POLICY "service_role_all_paywall_log" ON public.paywall_conversion_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) Garantir tabela payment_splits caso ainda não exista (só estrutura mínima)
CREATE TABLE IF NOT EXISTS public.payment_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid,
  source_type text,
  source_id uuid,
  creator_id uuid,
  affiliate_id uuid,
  gross_amount decimal(10,2) NOT NULL DEFAULT 0,
  tax_amount decimal(10,2) NOT NULL DEFAULT 0,
  platform_amount decimal(10,2) NOT NULL DEFAULT 0,
  affiliate_amount decimal(10,2) NOT NULL DEFAULT 0,
  net_amount decimal(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
