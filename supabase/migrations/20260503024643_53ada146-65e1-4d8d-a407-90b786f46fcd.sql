-- ════════════════════════════════════════════════════════════
-- Auditoria Split Monetização: remove engine duplicada e blinda RLS
-- Mantém process_payment_split (canônica) como única fonte de verdade
-- ════════════════════════════════════════════════════════════

-- 1. Remover RPC duplicada (não é chamada por nenhum código)
DROP FUNCTION IF EXISTS public.process_oculto_payment_split(text, numeric, text, uuid, uuid);

-- 2. Blindar tabelas legadas órfãs (user_balances, transaction_logs)
--    Removemos policies permissivas; só admin master pode tocar via SDK.
--    Toda escrita real de saldo passa por process_payment_split em profiles.pending_balance.

DROP POLICY IF EXISTS "System can manage balances" ON public.user_balances;
DROP POLICY IF EXISTS "System can insert transactions" ON public.transaction_logs;

-- Bloqueio total de escrita via SDK (apenas SECURITY DEFINER pode escrever)
CREATE POLICY "Block direct writes to user_balances"
ON public.user_balances AS RESTRICTIVE FOR ALL
USING (false) WITH CHECK (false);

CREATE POLICY "Block direct writes to transaction_logs"
ON public.transaction_logs AS RESTRICTIVE FOR INSERT
WITH CHECK (false);

-- Admin master mantém leitura para auditoria histórica
CREATE POLICY "Admin master can read legacy balances"
ON public.user_balances FOR SELECT
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin_master'));

CREATE POLICY "Admin master can read legacy transaction_logs"
ON public.transaction_logs FOR SELECT
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin_master'));

-- 3. Garantir constraint de tipo válido em transaction_split_logs (canônica)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transaction_split_logs_flow_type_check'
  ) THEN
    ALTER TABLE public.transaction_split_logs
      ADD CONSTRAINT transaction_split_logs_flow_type_check
      CHECK (flow_type IN ('platform_plan','creator_content','wallet_topup'));
  END IF;
END $$;

-- 4. Validação matemática: trigger garante que soma dos componentes = bruto
CREATE OR REPLACE FUNCTION public.validate_split_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum DECIMAL(10,2);
BEGIN
  v_sum := COALESCE(NEW.tax_amount,0) + COALESCE(NEW.platform_amount,0)
         + COALESCE(NEW.affiliate_amount,0) + COALESCE(NEW.creator_amount,0);
  -- Tolerância de 1 centavo para arredondamentos
  IF ABS(v_sum - NEW.gross_amount) > 0.01 THEN
    RAISE EXCEPTION 'Split inválido: soma componentes (%) ≠ bruto (%)', v_sum, NEW.gross_amount;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_split_integrity ON public.transaction_split_logs;
CREATE TRIGGER trg_validate_split_integrity
BEFORE INSERT ON public.transaction_split_logs
FOR EACH ROW EXECUTE FUNCTION public.validate_split_integrity();

-- 5. Índices para auditoria financeira
CREATE INDEX IF NOT EXISTS idx_split_logs_flow_type ON public.transaction_split_logs(flow_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_split_logs_creator ON public.transaction_split_logs(creator_id) WHERE creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_split_logs_affiliate ON public.transaction_split_logs(affiliate_id) WHERE affiliate_id IS NOT NULL;