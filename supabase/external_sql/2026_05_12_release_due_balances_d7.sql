-- =====================================================================
-- PROMPT 4 — Liberação automática D+7 (oculto_wallet_ledger)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente. Depende de 2026_05_12_oculto_creator_wallets_ledger.sql
-- =====================================================================

-- 1) Campos auxiliares no ledger
ALTER TABLE public.oculto_wallet_ledger
  ADD COLUMN IF NOT EXISTS released_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_reference  UUID;

CREATE INDEX IF NOT EXISTS idx_oculto_wallet_ledger_due
  ON public.oculto_wallet_ledger (available_at)
  WHERE type = 'credit_pending' AND released_at IS NULL;

-- 2) RPC principal: libera saldos vencidos D+7 (todos OU só de um criador)
CREATE OR REPLACE FUNCTION public.release_due_balances(
  p_creator_id UUID DEFAULT NULL,
  p_forced     BOOLEAN DEFAULT FALSE,
  p_actor_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              RECORD;
  v_release_id   UUID;
  v_count        INT := 0;
  v_total        NUMERIC(10,2) := 0;
  v_skipped      INT := 0;
  v_started      TIMESTAMPTZ := now();
BEGIN
  FOR r IN
    SELECT l.id, l.creator_id, l.amount, l.reference_id, l.available_at, l.metadata
      FROM public.oculto_wallet_ledger l
     WHERE l.type = 'credit_pending'
       AND l.released_at IS NULL
       AND (p_forced OR l.available_at <= now())
       AND (p_creator_id IS NULL OR l.creator_id = p_creator_id)
       -- Trava: não libera se houver refund/chargeback para a mesma referência
       AND NOT EXISTS (
         SELECT 1 FROM public.oculto_wallet_ledger x
          WHERE x.reference_table = l.reference_table
            AND x.reference_id    = l.reference_id
            AND x.type IN ('refund','chargeback')
       )
       -- Trava: não libera se o pending_balance_releases foi cancelado
       AND NOT EXISTS (
         SELECT 1 FROM public.pending_balance_releases pbr
          WHERE pbr.id = l.reference_id
            AND pbr.status IN ('cancelled','refunded','charged_back')
       )
     ORDER BY l.available_at ASC
     LIMIT 5000
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Move pending → available
    UPDATE public.oculto_creator_wallets
       SET pending_balance   = GREATEST(0, pending_balance - r.amount),
           available_balance = available_balance + r.amount,
           updated_at        = now()
     WHERE creator_id = r.creator_id;

    -- Insere ledger 'release' (idempotente via unique key)
    INSERT INTO public.oculto_wallet_ledger
      (creator_id, type, amount, reference_table, reference_id, metadata, released_at)
    VALUES
      (r.creator_id, 'release', r.amount,
       'pending_balance_releases', r.reference_id,
       jsonb_build_object(
         'auto_released', NOT p_forced,
         'forced',        p_forced,
         'actor_id',      p_actor_id,
         'source_ledger', r.id
       ),
       now())
    ON CONFLICT (reference_table, reference_id, type) DO NOTHING
    RETURNING id INTO v_release_id;

    -- Marca o credit_pending como liberado
    UPDATE public.oculto_wallet_ledger
       SET released_at = now(),
           release_reference = v_release_id
     WHERE id = r.id;

    -- Espelha status no pending_balance_releases (se ainda 'pending')
    UPDATE public.pending_balance_releases
       SET status = 'released'
     WHERE id = r.reference_id
       AND status = 'pending';

    v_count := v_count + 1;
    v_total := v_total + r.amount;
  END LOOP;

  -- Conta quantos foram pulados por trava (refund/chargeback/cancelled)
  SELECT COUNT(*) INTO v_skipped
    FROM public.oculto_wallet_ledger l
   WHERE l.type = 'credit_pending'
     AND l.released_at IS NULL
     AND (p_forced OR l.available_at <= now())
     AND (p_creator_id IS NULL OR l.creator_id = p_creator_id)
     AND (
       EXISTS (SELECT 1 FROM public.oculto_wallet_ledger x
                WHERE x.reference_table = l.reference_table
                  AND x.reference_id = l.reference_id
                  AND x.type IN ('refund','chargeback'))
       OR EXISTS (SELECT 1 FROM public.pending_balance_releases pbr
                   WHERE pbr.id = l.reference_id
                     AND pbr.status IN ('cancelled','refunded','charged_back'))
     );

  -- Log da execução em audit_logs
  BEGIN
    INSERT INTO public.audit_logs (admin_id, action, action_type, target_resource, details)
    VALUES (
      COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'release_due_balances',
      'release_due_balances',
      'oculto_wallet_ledger',
      jsonb_build_object(
        'released_count', v_count,
        'released_total', v_total,
        'skipped_blocked', v_skipped,
        'forced',          p_forced,
        'creator_filter',  p_creator_id,
        'duration_ms',     EXTRACT(EPOCH FROM (now() - v_started)) * 1000
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success',         true,
    'released_count',  v_count,
    'released_total',  v_total,
    'skipped_blocked', v_skipped,
    'forced',          p_forced,
    'creator_id',      p_creator_id,
    'duration_ms',     EXTRACT(EPOCH FROM (now() - v_started)) * 1000
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_due_balances(UUID, BOOLEAN, UUID) TO service_role;

-- 3) RPC para Admin Master forçar liberação manual (com checagem)
CREATE OR REPLACE FUNCTION public.release_due_balances_force_admin(
  p_creator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master BOOLEAN := FALSE;
BEGIN
  -- Reutiliza checagem existente
  BEGIN
    SELECT public.aura_is_master_admin() INTO v_is_master;
  EXCEPTION WHEN OTHERS THEN
    v_is_master := FALSE;
  END;

  IF NOT v_is_master THEN
    RAISE EXCEPTION 'Acesso negado: apenas Admin Master pode forçar liberação'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public.release_due_balances(
    p_creator_id := p_creator_id,
    p_forced     := TRUE,
    p_actor_id   := auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_due_balances_force_admin(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- AGENDAMENTO (cole SEPARADAMENTE; substitua YOUR_ANON_KEY pelo anon do projeto):
--
-- SELECT cron.schedule(
--   'release-due-balances-hourly',
--   '0 * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://rvybbrkzmboqbhcemqar.supabase.co/functions/v1/release-pending-balances',
--     headers := '{"Content-Type":"application/json","apikey":"YOUR_ANON_KEY"}'::jsonb,
--     body    := jsonb_build_object('triggered_at', now())
--   );
--   $$
-- );
-- =====================================================================
