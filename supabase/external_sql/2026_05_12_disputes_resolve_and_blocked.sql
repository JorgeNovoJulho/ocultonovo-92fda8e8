-- ============================================================================
-- PROMPT 7.1 — Resolução manual de disputas + visão de transações bloqueadas
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Depende de: 2026_05_12_chargebacks_disputes.sql + asaas_webhook_logs.
-- ============================================================================

-- 1) Coluna de notas internas (decisão Master)
ALTER TABLE public.oculto_chargebacks_disputes
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- 2) RPC: Admin Master marca uma disputa como resolved/closed/chargeback_lost
CREATE OR REPLACE FUNCTION public.oculto_resolve_dispute(
  p_dispute_id UUID,
  p_status     TEXT,           -- 'closed' | 'chargeback_lost' | 'resolved'
  p_decision   TEXT DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_master BOOLEAN := FALSE;
  v_row       public.oculto_chargebacks_disputes%ROWTYPE;
BEGIN
  BEGIN
    SELECT public.aura_is_master_admin() INTO v_is_master;
  EXCEPTION WHEN OTHERS THEN
    v_is_master := FALSE;
  END;

  IF NOT v_is_master THEN
    RAISE EXCEPTION 'Acesso negado: apenas Admin Master pode resolver disputas'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_status NOT IN ('closed','chargeback_lost','resolved','under_dispute','opened') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  UPDATE public.oculto_chargebacks_disputes
     SET status      = p_status,
         decision    = COALESCE(p_decision, decision, p_status),
         resolution_notes = COALESCE(p_notes, resolution_notes),
         resolved_at = CASE WHEN p_status IN ('closed','chargeback_lost','resolved')
                            THEN COALESCE(resolved_at, NOW()) ELSE resolved_at END,
         metadata    = metadata || jsonb_build_object(
           'manual_resolution', jsonb_build_object(
             'actor_id',  auth.uid(),
             'status',    p_status,
             'decision',  p_decision,
             'notes',     p_notes,
             'at',        NOW()
           ))
   WHERE id = p_dispute_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Disputa % não encontrada', p_dispute_id;
  END IF;

  BEGIN
    INSERT INTO public.audit_logs (admin_id, action, action_type, target_resource, details)
    VALUES (
      auth.uid(),
      'dispute_resolved',
      'dispute_resolved',
      'oculto_chargebacks_disputes',
      jsonb_build_object(
        'dispute_id', v_row.id,
        'payment_external_id', v_row.payment_external_id,
        'status', p_status,
        'decision', p_decision,
        'notes', p_notes
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'dispute_id', v_row.id, 'status', p_status);
END $$;

REVOKE ALL ON FUNCTION public.oculto_resolve_dispute(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_resolve_dispute(UUID,TEXT,TEXT,TEXT) TO authenticated;

-- 3) View: transações bloqueadas associadas a uma disputa (via payment_external_id)
DROP VIEW IF EXISTS public.v_admin_dispute_blocked_transactions;
CREATE VIEW public.v_admin_dispute_blocked_transactions AS
SELECT
  d.id                          AS dispute_id,
  d.payment_external_id,
  t.id                          AS transaction_id,
  t.user_id                     AS buyer_id,
  t.seller_id                   AS creator_id,
  t.amount,
  t.status                      AS transaction_status,
  COALESCE((t.metadata->>'withdrawal_blocked')::boolean, FALSE) AS withdrawal_blocked,
  t.metadata->>'block_reason'   AS block_reason,
  (t.metadata->>'blocked_at')::timestamptz AS blocked_at,
  t.created_at,
  pc.name                       AS creator_name,
  pb.name                       AS buyer_name
FROM public.oculto_chargebacks_disputes d
LEFT JOIN public.transactions t
       ON t.id = d.transaction_id
       OR t.external_id = d.payment_external_id
LEFT JOIN public.profiles pc ON pc.id = t.seller_id
LEFT JOIN public.profiles pb ON pb.id = t.user_id;
ALTER VIEW public.v_admin_dispute_blocked_transactions SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
