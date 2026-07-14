-- ============================================================================
-- HARDENING — Refund / Chargeback / Dívida do Criador (idempotente)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Depende de: chargebacks_disputes, pending_balance_releases, transactions, profiles
-- ============================================================================

-- 1) Tabela de dívidas do criador (saldo negativo controlado)
CREATE TABLE IF NOT EXISTS public.oculto_creator_debts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          UUID NOT NULL,
  amount              NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason              TEXT NOT NULL DEFAULT 'chargeback',
  source_transaction  UUID,
  source_dispute      UUID,
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','partial','settled','written_off','cancelled')),
  amount_settled      NUMERIC(10,2) NOT NULL DEFAULT 0,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creator_debts_creator ON public.oculto_creator_debts (creator_id, status);
CREATE INDEX IF NOT EXISTS idx_creator_debts_status  ON public.oculto_creator_debts (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_creator_debts_dispute
  ON public.oculto_creator_debts (source_dispute) WHERE source_dispute IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_creator_debts_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_creator_debts_touch ON public.oculto_creator_debts;
CREATE TRIGGER trg_creator_debts_touch BEFORE UPDATE ON public.oculto_creator_debts
  FOR EACH ROW EXECUTE FUNCTION public.tg_creator_debts_touch();

ALTER TABLE public.oculto_creator_debts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "debts_service_all"     ON public.oculto_creator_debts;
DROP POLICY IF EXISTS "debts_creator_select"  ON public.oculto_creator_debts;
DROP POLICY IF EXISTS "debts_master_select"   ON public.oculto_creator_debts;
DROP POLICY IF EXISTS "debts_master_update"   ON public.oculto_creator_debts;

CREATE POLICY "debts_service_all" ON public.oculto_creator_debts
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "debts_creator_select" ON public.oculto_creator_debts
  FOR SELECT TO authenticated
  USING (creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
         OR creator_id = auth.uid());

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='aura_is_master_admin') THEN
    EXECUTE $POL$
      CREATE POLICY "debts_master_select" ON public.oculto_creator_debts
        FOR SELECT TO authenticated USING (public.aura_is_master_admin())
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "debts_master_update" ON public.oculto_creator_debts
        FOR UPDATE TO authenticated
        USING (public.aura_is_master_admin())
        WITH CHECK (public.aura_is_master_admin())
    $POL$;
  END IF;
END $$;

-- 2) RPC: registrar dívida idempotente quando saldo não cobre o estorno
CREATE OR REPLACE FUNCTION public.oculto_register_creator_debt(
  p_creator_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_source_transaction UUID,
  p_source_dispute UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN NULL; END IF;

  IF p_source_dispute IS NOT NULL THEN
    SELECT id INTO v_id FROM public.oculto_creator_debts
    WHERE source_dispute = p_source_dispute LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.oculto_creator_debts (
    creator_id, amount, reason, source_transaction, source_dispute, metadata
  ) VALUES (
    p_creator_id, ROUND(p_amount::numeric, 2), COALESCE(p_reason, 'chargeback'),
    p_source_transaction, p_source_dispute, COALESCE(p_metadata,'{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.oculto_register_creator_debt(UUID,NUMERIC,TEXT,UUID,UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_register_creator_debt(UUID,NUMERIC,TEXT,UUID,UUID,JSONB) TO service_role;

-- 3) RPC: aplicar estorno seguro (debita saldo; se faltar, cria dívida)
CREATE OR REPLACE FUNCTION public.oculto_apply_refund_debit(
  p_creator_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_source_transaction UUID,
  p_source_dispute UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance     NUMERIC(10,2);
  v_debit_now   NUMERIC(10,2);
  v_debt_amount NUMERIC(10,2);
  v_debt_id     UUID;
  v_pending     NUMERIC(10,2);
BEGIN
  IF p_creator_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Cancela liberações futuras D+7 que ainda não saíram (até cobrir o valor)
  WITH to_cancel AS (
    SELECT id, amount
    FROM public.pending_balance_releases
    WHERE source_transaction_id = p_source_transaction
      AND status = 'pending'
    ORDER BY release_at ASC
    FOR UPDATE
  )
  SELECT COALESCE(SUM(amount),0) INTO v_pending FROM to_cancel;

  UPDATE public.pending_balance_releases
  SET status = 'cancelled',
      metadata = COALESCE(metadata,'{}'::jsonb)
        || jsonb_build_object('cancelled_by', 'refund', 'dispute_id', p_source_dispute, 'at', NOW())
  WHERE source_transaction_id = p_source_transaction AND status = 'pending';

  -- Saldo atual do criador
  SELECT COALESCE(balance,0) INTO v_balance FROM public.profiles
  WHERE id = p_creator_id FOR UPDATE;

  v_debit_now   := LEAST(GREATEST(v_balance,0), p_amount);
  v_debt_amount := p_amount - v_debit_now;

  IF v_debit_now > 0 THEN
    UPDATE public.profiles SET balance = balance - v_debit_now WHERE id = p_creator_id;
  END IF;

  IF v_debt_amount > 0 THEN
    v_debt_id := public.oculto_register_creator_debt(
      p_creator_id, v_debt_amount, p_reason, p_source_transaction, p_source_dispute,
      jsonb_build_object('balance_at_event', v_balance, 'pending_cancelled', v_pending)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'debited_from_balance', v_debit_now,
    'debt_created', v_debt_amount,
    'debt_id', v_debt_id,
    'pending_cancelled', v_pending
  );
END $$;
REVOKE ALL ON FUNCTION public.oculto_apply_refund_debit(UUID,NUMERIC,TEXT,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_apply_refund_debit(UUID,NUMERIC,TEXT,UUID,UUID) TO service_role;

-- 4) RPC: reverter comissão de afiliado idempotente
CREATE OR REPLACE FUNCTION public.oculto_reverse_affiliate_commission(
  p_affiliate_id UUID,
  p_source_transaction UUID,
  p_source_dispute UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_commission NUMERIC(10,2) := 0;
  v_already    BOOLEAN := FALSE;
BEGIN
  IF p_affiliate_id IS NULL OR p_source_transaction IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- já revertida?
  SELECT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE external_id = 'affiliate_reversal_' || p_source_transaction::text
      AND type = 'affiliate_reversal'
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_reversed');
  END IF;

  -- valor original da comissão
  SELECT COALESCE(amount,0) INTO v_commission
  FROM public.transactions
  WHERE external_id = 'affiliate_' || p_source_transaction::text
    AND type = 'affiliate_commission'
  ORDER BY created_at DESC LIMIT 1;

  IF v_commission <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_commission');
  END IF;

  -- marca comissão original como estornada
  UPDATE public.transactions
  SET status = 'reversed',
      metadata = COALESCE(metadata,'{}'::jsonb)
        || jsonb_build_object('reversed_at', NOW(), 'dispute_id', p_source_dispute)
  WHERE external_id = 'affiliate_' || p_source_transaction::text
    AND type = 'affiliate_commission';

  -- aplica débito seguro no afiliado
  PERFORM public.oculto_apply_refund_debit(
    p_affiliate_id, v_commission, 'affiliate_chargeback',
    p_source_transaction, p_source_dispute
  );

  -- registra a transação de reversão (lock idempotente via external_id)
  INSERT INTO public.transactions (
    user_id, amount, type, status, description, external_id, metadata
  ) VALUES (
    p_affiliate_id, -v_commission, 'affiliate_reversal', 'completed',
    'Reversão de comissão (chargeback/refund)',
    'affiliate_reversal_' || p_source_transaction::text,
    jsonb_build_object('source_transaction', p_source_transaction, 'dispute_id', p_source_dispute)
  ) ON CONFLICT (external_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'reversed_amount', v_commission);
END $$;
REVOKE ALL ON FUNCTION public.oculto_reverse_affiliate_commission(UUID,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_reverse_affiliate_commission(UUID,UUID,UUID) TO service_role;

-- 5) Bloqueio de saque com dívida em aberto
CREATE OR REPLACE FUNCTION public.oculto_creator_total_debt(p_creator_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount - amount_settled), 0)
  FROM public.oculto_creator_debts
  WHERE creator_id = p_creator_id AND status IN ('open','partial');
$$;
GRANT EXECUTE ON FUNCTION public.oculto_creator_total_debt(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_block_withdrawal_when_debt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_debt NUMERIC(10,2);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT public.oculto_creator_total_debt(NEW.user_id) INTO v_debt;
    IF v_debt > 0 THEN
      RAISE EXCEPTION 'Saque bloqueado: criador possui dívida em aberto de R$ %', v_debt
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='withdrawal_requests') THEN
    DROP TRIGGER IF EXISTS trg_block_withdrawal_when_debt ON public.withdrawal_requests;
    CREATE TRIGGER trg_block_withdrawal_when_debt
      BEFORE INSERT ON public.withdrawal_requests
      FOR EACH ROW EXECUTE FUNCTION public.tg_block_withdrawal_when_debt();
  END IF;
END $$;

-- 6) Quando saldo positivo aparece, abate dívidas (FIFO)
CREATE OR REPLACE FUNCTION public.oculto_settle_creator_debts(p_creator_id UUID, p_amount NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_remaining NUMERIC(10,2) := p_amount;
  v_debt RECORD;
  v_apply NUMERIC(10,2);
BEGIN
  IF v_remaining IS NULL OR v_remaining <= 0 THEN RETURN 0; END IF;

  FOR v_debt IN
    SELECT id, (amount - amount_settled) AS open_amount
    FROM public.oculto_creator_debts
    WHERE creator_id = p_creator_id AND status IN ('open','partial')
    ORDER BY created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_debt.open_amount);

    UPDATE public.oculto_creator_debts
    SET amount_settled = amount_settled + v_apply,
        status = CASE WHEN amount_settled + v_apply >= amount THEN 'settled' ELSE 'partial' END,
        resolved_at = CASE WHEN amount_settled + v_apply >= amount THEN NOW() ELSE resolved_at END
    WHERE id = v_debt.id;

    v_remaining := v_remaining - v_apply;
  END LOOP;

  RETURN p_amount - v_remaining; -- valor abatido
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_settle_creator_debts(UUID, NUMERIC) TO service_role;

-- 7) View consolidada para Admin Master
DROP VIEW IF EXISTS public.v_admin_refund_chargeback_overview;
CREATE VIEW public.v_admin_refund_chargeback_overview AS
SELECT
  (SELECT COUNT(*) FROM public.oculto_chargebacks_disputes
     WHERE status IN ('opened','under_dispute')) AS open_disputes,
  (SELECT COUNT(*) FROM public.oculto_chargebacks_disputes
     WHERE status = 'refunded') AS total_refunds,
  (SELECT COUNT(*) FROM public.oculto_chargebacks_disputes
     WHERE status IN ('chargeback_lost','closed')) AS resolved_disputes,
  (SELECT COUNT(*) FROM public.oculto_creator_debts
     WHERE status IN ('open','partial')) AS creators_with_debt,
  (SELECT COALESCE(SUM(amount - amount_settled),0) FROM public.oculto_creator_debts
     WHERE status IN ('open','partial')) AS total_debt_open,
  (SELECT COUNT(*) FROM public.transactions
     WHERE type = 'affiliate_reversal' AND status = 'completed') AS affiliate_reversals,
  (SELECT COALESCE(SUM(amount),0) FROM public.oculto_chargebacks_disputes
     WHERE status IN ('opened','under_dispute')) AS amount_in_dispute,
  (SELECT COALESCE(SUM(amount),0) FROM public.pending_balance_releases
     WHERE status = 'cancelled' AND released_at IS NULL) AS pending_cancelled_amount;
ALTER VIEW public.v_admin_refund_chargeback_overview SET (security_invoker = true);

DROP VIEW IF EXISTS public.v_admin_creator_debts;
CREATE VIEW public.v_admin_creator_debts AS
SELECT
  d.id, d.creator_id, p.name AS creator_name, p.username,
  d.amount, d.amount_settled, (d.amount - d.amount_settled) AS open_amount,
  d.status, d.reason, d.source_transaction, d.source_dispute,
  d.created_at, d.resolved_at
FROM public.oculto_creator_debts d
LEFT JOIN public.profiles p ON p.id = d.creator_id;
ALTER VIEW public.v_admin_creator_debts SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
