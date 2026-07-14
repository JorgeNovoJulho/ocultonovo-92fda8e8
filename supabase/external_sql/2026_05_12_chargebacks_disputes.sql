-- ============================================================================
-- PROMPT 7 — Disputas, Chargebacks e Reversão de Split (idempotente)
-- Executar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_chargebacks_disputes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      UUID,
  payment_external_id TEXT,
  creator_id          UUID,
  affiliate_id        UUID,
  buyer_user_id       UUID,
  asaas_dispute_id    TEXT,
  event_type          TEXT,
  status              TEXT NOT NULL DEFAULT 'opened',
  reason              TEXT,
  amount              NUMERIC(10,2) NOT NULL DEFAULT 0,
  creator_debit       NUMERIC(10,2) NOT NULL DEFAULT 0,
  affiliate_debit     NUMERIC(10,2) NOT NULL DEFAULT 0,
  evidence_due_date   DATE,
  opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  decision            TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.oculto_chargebacks_disputes ADD COLUMN IF NOT EXISTS payment_external_id TEXT;
ALTER TABLE public.oculto_chargebacks_disputes ADD COLUMN IF NOT EXISTS buyer_user_id       UUID;
ALTER TABLE public.oculto_chargebacks_disputes ADD COLUMN IF NOT EXISTS event_type          TEXT;
ALTER TABLE public.oculto_chargebacks_disputes ADD COLUMN IF NOT EXISTS creator_debit       NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.oculto_chargebacks_disputes ADD COLUMN IF NOT EXISTS affiliate_debit     NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.oculto_chargebacks_disputes ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_disputes_status_opened ON public.oculto_chargebacks_disputes (status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_creator ON public.oculto_chargebacks_disputes (creator_id);
CREATE INDEX IF NOT EXISTS idx_disputes_affiliate ON public.oculto_chargebacks_disputes (affiliate_id);
CREATE INDEX IF NOT EXISTS idx_disputes_payment_external ON public.oculto_chargebacks_disputes (payment_external_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_asaas_unique ON public.oculto_chargebacks_disputes (asaas_dispute_id) WHERE asaas_dispute_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_oculto_disputes_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_oculto_disputes_touch ON public.oculto_chargebacks_disputes;
CREATE TRIGGER trg_oculto_disputes_touch BEFORE UPDATE ON public.oculto_chargebacks_disputes
  FOR EACH ROW EXECUTE FUNCTION public.tg_oculto_disputes_touch();

ALTER TABLE public.oculto_chargebacks_disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "disputes_service_all"      ON public.oculto_chargebacks_disputes;
DROP POLICY IF EXISTS "disputes_master_select"    ON public.oculto_chargebacks_disputes;
DROP POLICY IF EXISTS "disputes_master_update"    ON public.oculto_chargebacks_disputes;
DROP POLICY IF EXISTS "disputes_creator_select"   ON public.oculto_chargebacks_disputes;
DROP POLICY IF EXISTS "disputes_affiliate_select" ON public.oculto_chargebacks_disputes;

CREATE POLICY "disputes_service_all" ON public.oculto_chargebacks_disputes
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='has_role') THEN
    EXECUTE $POL$
      CREATE POLICY "disputes_master_select" ON public.oculto_chargebacks_disputes
        FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin_master'))
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "disputes_master_update" ON public.oculto_chargebacks_disputes
        FOR UPDATE TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $POL$;
  ELSE
    EXECUTE $POL$
      CREATE POLICY "disputes_master_select" ON public.oculto_chargebacks_disputes
        FOR SELECT TO authenticated USING (false)
    $POL$;
  END IF;
END $$;

CREATE POLICY "disputes_creator_select" ON public.oculto_chargebacks_disputes
  FOR SELECT TO authenticated
  USING (creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
         OR creator_id = auth.uid());

CREATE POLICY "disputes_affiliate_select" ON public.oculto_chargebacks_disputes
  FOR SELECT TO authenticated USING (affiliate_id = auth.uid());

CREATE OR REPLACE FUNCTION public.oculto_block_transaction_withdrawal(
  p_transaction_id UUID, p_reason TEXT DEFAULT 'chargeback'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.transactions
  SET metadata = COALESCE(metadata,'{}'::jsonb)
    || jsonb_build_object('withdrawal_blocked', true, 'block_reason', p_reason, 'blocked_at', NOW())
  WHERE id = p_transaction_id;

  UPDATE public.pending_balance_releases SET status = 'cancelled'
  WHERE source_transaction_id = p_transaction_id AND status = 'pending';
END $$;
REVOKE ALL ON FUNCTION public.oculto_block_transaction_withdrawal(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_block_transaction_withdrawal(UUID, TEXT) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.oculto_register_dispute(
  p_transaction_id UUID, p_payment_external_id TEXT,
  p_creator_id UUID, p_affiliate_id UUID, p_buyer_user_id UUID,
  p_event_type TEXT, p_amount NUMERIC,
  p_creator_debit NUMERIC, p_affiliate_debit NUMERIC,
  p_status TEXT, p_reason TEXT, p_asaas_dispute_id TEXT, p_metadata JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.oculto_chargebacks_disputes
  WHERE (p_asaas_dispute_id IS NOT NULL AND asaas_dispute_id = p_asaas_dispute_id)
     OR (asaas_dispute_id IS NULL AND payment_external_id = p_payment_external_id
         AND COALESCE(transaction_id::text,'') = COALESCE(p_transaction_id::text,''))
  ORDER BY opened_at DESC LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.oculto_chargebacks_disputes (
      transaction_id, payment_external_id, creator_id, affiliate_id,
      buyer_user_id, asaas_dispute_id, event_type, status, reason,
      amount, creator_debit, affiliate_debit, metadata, resolved_at, decision
    ) VALUES (
      p_transaction_id, p_payment_external_id, p_creator_id, p_affiliate_id,
      p_buyer_user_id, p_asaas_dispute_id, p_event_type, p_status, p_reason,
      COALESCE(p_amount,0), COALESCE(p_creator_debit,0), COALESCE(p_affiliate_debit,0),
      COALESCE(p_metadata,'{}'::jsonb),
      CASE WHEN p_status IN ('refunded','chargeback_lost','reversed','closed') THEN NOW() END,
      CASE WHEN p_status IN ('refunded','chargeback_lost','reversed','closed') THEN p_status END
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.oculto_chargebacks_disputes
    SET status = p_status,
        event_type = COALESCE(p_event_type, event_type),
        creator_debit = GREATEST(creator_debit, COALESCE(p_creator_debit,0)),
        affiliate_debit = GREATEST(affiliate_debit, COALESCE(p_affiliate_debit,0)),
        metadata = metadata || COALESCE(p_metadata,'{}'::jsonb),
        resolved_at = CASE WHEN p_status IN ('refunded','chargeback_lost','reversed','closed') THEN NOW() ELSE resolved_at END,
        decision = CASE WHEN p_status IN ('refunded','chargeback_lost','reversed','closed') THEN p_status ELSE decision END
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.oculto_register_dispute(UUID,TEXT,UUID,UUID,UUID,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_register_dispute(UUID,TEXT,UUID,UUID,UUID,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.oculto_reverse_chargeback(p_payment_external_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dispute public.oculto_chargebacks_disputes%ROWTYPE;
BEGIN
  SELECT * INTO v_dispute FROM public.oculto_chargebacks_disputes
  WHERE payment_external_id = p_payment_external_id
  ORDER BY opened_at DESC LIMIT 1;

  IF v_dispute.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dispute_not_found');
  END IF;

  IF v_dispute.creator_id IS NOT NULL AND v_dispute.creator_debit > 0 THEN
    PERFORM public.add_to_balance(v_dispute.creator_id, v_dispute.creator_debit);
  END IF;
  IF v_dispute.affiliate_id IS NOT NULL AND v_dispute.affiliate_debit > 0 THEN
    PERFORM public.add_to_balance(v_dispute.affiliate_id, v_dispute.affiliate_debit);
  END IF;

  IF v_dispute.transaction_id IS NOT NULL THEN
    UPDATE public.transactions
    SET status = 'completed',
        metadata = COALESCE(metadata,'{}'::jsonb)
          || jsonb_build_object('chargeback_reversed_at', NOW(), 'withdrawal_blocked', false)
    WHERE id = v_dispute.transaction_id;

    UPDATE public.transactions SET status = 'completed'
    WHERE external_id = 'affiliate_' || v_dispute.transaction_id::text
      AND type = 'affiliate_commission';
  END IF;

  UPDATE public.oculto_chargebacks_disputes
  SET status = 'reversed', decision = 'reversed', resolved_at = NOW(),
      metadata = metadata || jsonb_build_object('reversed_at', NOW())
  WHERE id = v_dispute.id;

  RETURN jsonb_build_object('ok', true, 'dispute_id', v_dispute.id);
END $$;
REVOKE ALL ON FUNCTION public.oculto_reverse_chargeback(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_reverse_chargeback(TEXT) TO service_role, authenticated;

DROP VIEW IF EXISTS public.v_admin_disputes;
CREATE VIEW public.v_admin_disputes AS
SELECT d.*, pc.name AS creator_name, pa.name AS affiliate_name, pb.name AS buyer_name
FROM public.oculto_chargebacks_disputes d
LEFT JOIN public.profiles pc ON pc.id = d.creator_id
LEFT JOIN public.profiles pa ON pa.user_id = d.affiliate_id
LEFT JOIN public.profiles pb ON pb.id = d.buyer_user_id;
ALTER VIEW public.v_admin_disputes SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
