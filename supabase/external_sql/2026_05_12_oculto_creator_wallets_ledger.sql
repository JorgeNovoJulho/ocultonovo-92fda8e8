-- =====================================================================
-- LEDGER FORMAL DA CARTEIRA DO CRIADOR (oculto_creator_wallets)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente. Não altera process_payment_split. Não apaga histórico.
-- =====================================================================

-- 1) Tabelas
CREATE TABLE IF NOT EXISTS public.oculto_creator_wallets (
  creator_id          UUID PRIMARY KEY,
  pending_balance     NUMERIC(10,2) NOT NULL DEFAULT 0,
  available_balance   NUMERIC(10,2) NOT NULL DEFAULT 0,
  blocked_balance     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_earned        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_withdrawn     NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oculto_wallet_ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL,
  type             TEXT NOT NULL CHECK (type IN (
    'credit_pending','release','withdrawal','refund',
    'chargeback','freeze','unfreeze','adjustment'
  )),
  amount           NUMERIC(10,2) NOT NULL,
  reference_table  TEXT,
  reference_id     UUID,
  available_at     TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotência por (referência + tipo) → permite ON CONFLICT DO NOTHING no backfill
CREATE UNIQUE INDEX IF NOT EXISTS ux_oculto_wallet_ledger_ref_type
  ON public.oculto_wallet_ledger (reference_table, reference_id, type)
  WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oculto_wallet_ledger_creator
  ON public.oculto_wallet_ledger (creator_id, created_at DESC);

-- 2) RLS
ALTER TABLE public.oculto_creator_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_wallet_ledger   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_creator_wallets' AND policyname='wallet_owner_select') THEN
    CREATE POLICY wallet_owner_select ON public.oculto_creator_wallets
      FOR SELECT USING (
        creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_wallet_ledger' AND policyname='ledger_owner_select') THEN
    CREATE POLICY ledger_owner_select ON public.oculto_wallet_ledger
      FOR SELECT USING (
        creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- 3) Helper: garante a wallet do criador
CREATE OR REPLACE FUNCTION public.oculto_ensure_wallet(p_creator_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_creator_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.oculto_creator_wallets (creator_id)
  VALUES (p_creator_id)
  ON CONFLICT (creator_id) DO NOTHING;
END;
$$;

-- 4) RPC pública (RLS-friendly): saldo do próprio criador
CREATE OR REPLACE FUNCTION public.oculto_get_my_wallet()
RETURNS public.oculto_creator_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_pid UUID;
  v_row public.oculto_creator_wallets;
BEGIN
  SELECT id INTO v_pid FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_pid IS NULL THEN RETURN NULL; END IF;
  PERFORM public.oculto_ensure_wallet(v_pid);
  SELECT * INTO v_row FROM public.oculto_creator_wallets WHERE creator_id = v_pid;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_get_my_wallet() TO authenticated;

-- 5) Trigger em pending_balance_releases (mantido como hoje pelo process_payment_split)
CREATE OR REPLACE FUNCTION public.oculto_pbr_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.oculto_ensure_wallet(NEW.profile_id);
    UPDATE public.oculto_creator_wallets
       SET pending_balance = pending_balance + NEW.amount,
           total_earned    = total_earned + NEW.amount,
           updated_at      = now()
     WHERE creator_id = NEW.profile_id;

    INSERT INTO public.oculto_wallet_ledger
      (creator_id, type, amount, reference_table, reference_id, available_at, metadata)
    VALUES
      (NEW.profile_id, 'credit_pending', NEW.amount,
       'pending_balance_releases', NEW.id, NEW.release_at,
       jsonb_build_object('source_type', NEW.source_type))
    ON CONFLICT (reference_table, reference_id, type) DO NOTHING;

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Liberação: pending -> available
    IF NEW.status = 'released' AND OLD.status = 'pending' THEN
      UPDATE public.oculto_creator_wallets
         SET pending_balance   = GREATEST(0, pending_balance   - NEW.amount),
             available_balance = available_balance + NEW.amount,
             updated_at        = now()
       WHERE creator_id = NEW.profile_id;
      INSERT INTO public.oculto_wallet_ledger
        (creator_id, type, amount, reference_table, reference_id, metadata)
      VALUES
        (NEW.profile_id, 'release', NEW.amount,
         'pending_balance_releases', NEW.id,
         jsonb_build_object('source_type', NEW.source_type))
      ON CONFLICT (reference_table, reference_id, type) DO NOTHING;

    -- Cancelamento/refund/chargeback: derruba o pending
    ELSIF NEW.status IN ('cancelled','refunded','charged_back') AND OLD.status = 'pending' THEN
      UPDATE public.oculto_creator_wallets
         SET pending_balance = GREATEST(0, pending_balance - NEW.amount),
             total_earned    = GREATEST(0, total_earned    - NEW.amount),
             updated_at      = now()
       WHERE creator_id = NEW.profile_id;
      INSERT INTO public.oculto_wallet_ledger
        (creator_id, type, amount, reference_table, reference_id, metadata)
      VALUES
        (NEW.profile_id,
         CASE WHEN NEW.status = 'charged_back' THEN 'chargeback' ELSE 'refund' END,
         -NEW.amount,
         'pending_balance_releases', NEW.id,
         jsonb_build_object('source_type', NEW.source_type, 'reason', NEW.status))
      ON CONFLICT (reference_table, reference_id, type) DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_pbr_to_ledger ON public.pending_balance_releases;
CREATE TRIGGER trg_oculto_pbr_to_ledger
  AFTER INSERT OR UPDATE ON public.pending_balance_releases
  FOR EACH ROW EXECUTE FUNCTION public.oculto_pbr_to_ledger();

-- 6) Trigger em withdrawal_requests
--    INSERT(pending) → bloqueia available  | UPDATE(completed) → debita | UPDATE(rejected) → libera
CREATE OR REPLACE FUNCTION public.oculto_withdrawal_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avail NUMERIC(10,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.oculto_ensure_wallet(NEW.user_id);

    -- Trava de saldo: bloqueia se available < amount (não derruba pedido se já processado)
    SELECT available_balance INTO v_avail
      FROM public.oculto_creator_wallets WHERE creator_id = NEW.user_id;
    IF COALESCE(v_avail,0) < NEW.amount THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente para saque (disponível: %, solicitado: %)',
        COALESCE(v_avail,0), NEW.amount
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.oculto_creator_wallets
       SET available_balance = available_balance - NEW.amount,
           blocked_balance   = blocked_balance + NEW.amount,
           updated_at        = now()
     WHERE creator_id = NEW.user_id;

    INSERT INTO public.oculto_wallet_ledger
      (creator_id, type, amount, reference_table, reference_id, metadata)
    VALUES
      (NEW.user_id, 'freeze', NEW.amount, 'withdrawal_requests', NEW.id,
       jsonb_build_object('status', NEW.status))
    ON CONFLICT (reference_table, reference_id, type) DO NOTHING;

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('completed','paid') AND OLD.status IN ('pending','approved','processing') THEN
      UPDATE public.oculto_creator_wallets
         SET blocked_balance = GREATEST(0, blocked_balance - OLD.amount),
             total_withdrawn = total_withdrawn + OLD.amount,
             updated_at      = now()
       WHERE creator_id = NEW.user_id;
      INSERT INTO public.oculto_wallet_ledger
        (creator_id, type, amount, reference_table, reference_id, metadata)
      VALUES
        (NEW.user_id, 'withdrawal', -OLD.amount, 'withdrawal_requests', NEW.id,
         jsonb_build_object('status', NEW.status))
      ON CONFLICT (reference_table, reference_id, type) DO NOTHING;

    ELSIF NEW.status = 'rejected' AND OLD.status IN ('pending','approved','processing') THEN
      UPDATE public.oculto_creator_wallets
         SET blocked_balance   = GREATEST(0, blocked_balance - OLD.amount),
             available_balance = available_balance + OLD.amount,
             updated_at        = now()
       WHERE creator_id = NEW.user_id;
      INSERT INTO public.oculto_wallet_ledger
        (creator_id, type, amount, reference_table, reference_id, metadata)
      VALUES
        (NEW.user_id, 'unfreeze', OLD.amount, 'withdrawal_requests', NEW.id,
         jsonb_build_object('status', NEW.status, 'admin_notes', NEW.admin_notes))
      ON CONFLICT (reference_table, reference_id, type) DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_withdrawal_to_ledger ON public.withdrawal_requests;
CREATE TRIGGER trg_oculto_withdrawal_to_ledger
  AFTER INSERT OR UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.oculto_withdrawal_to_ledger();

-- 7) BACKFILL seguro (idempotente — usa ON CONFLICT na unique key)
DO $$
DECLARE r RECORD;
BEGIN
  -- 7a) garante wallets para todos com receitas/saques
  INSERT INTO public.oculto_creator_wallets (creator_id)
  SELECT DISTINCT profile_id FROM public.pending_balance_releases WHERE profile_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  INSERT INTO public.oculto_creator_wallets (creator_id)
  SELECT DISTINCT user_id FROM public.withdrawal_requests WHERE user_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- 7b) credit_pending + release a partir de pending_balance_releases
  FOR r IN
    SELECT id, profile_id, amount, source_type, status, release_at
      FROM public.pending_balance_releases
     WHERE profile_id IS NOT NULL
  LOOP
    INSERT INTO public.oculto_wallet_ledger
      (creator_id, type, amount, reference_table, reference_id, available_at, metadata)
    VALUES
      (r.profile_id, 'credit_pending', r.amount,
       'pending_balance_releases', r.id, r.release_at,
       jsonb_build_object('source_type', r.source_type, 'backfill', true))
    ON CONFLICT (reference_table, reference_id, type) DO NOTHING;

    IF r.status = 'released' THEN
      INSERT INTO public.oculto_wallet_ledger
        (creator_id, type, amount, reference_table, reference_id, metadata)
      VALUES
        (r.profile_id, 'release', r.amount,
         'pending_balance_releases', r.id,
         jsonb_build_object('source_type', r.source_type, 'backfill', true))
      ON CONFLICT (reference_table, reference_id, type) DO NOTHING;
    END IF;
  END LOOP;

  -- 7c) saques históricos
  FOR r IN
    SELECT id, user_id, amount, status FROM public.withdrawal_requests WHERE user_id IS NOT NULL
  LOOP
    INSERT INTO public.oculto_wallet_ledger
      (creator_id, type, amount, reference_table, reference_id, metadata)
    VALUES
      (r.user_id, 'freeze', r.amount, 'withdrawal_requests', r.id,
       jsonb_build_object('status', r.status, 'backfill', true))
    ON CONFLICT (reference_table, reference_id, type) DO NOTHING;

    IF r.status IN ('completed','paid') THEN
      INSERT INTO public.oculto_wallet_ledger
        (creator_id, type, amount, reference_table, reference_id, metadata)
      VALUES
        (r.user_id, 'withdrawal', -r.amount, 'withdrawal_requests', r.id,
         jsonb_build_object('status', r.status, 'backfill', true))
      ON CONFLICT (reference_table, reference_id, type) DO NOTHING;
    ELSIF r.status = 'rejected' THEN
      INSERT INTO public.oculto_wallet_ledger
        (creator_id, type, amount, reference_table, reference_id, metadata)
      VALUES
        (r.user_id, 'unfreeze', r.amount, 'withdrawal_requests', r.id,
         jsonb_build_object('status', r.status, 'backfill', true))
      ON CONFLICT (reference_table, reference_id, type) DO NOTHING;
    END IF;
  END LOOP;

  -- 7d) recomputa snapshot da wallet a partir do ledger (fonte da verdade)
  UPDATE public.oculto_creator_wallets w
     SET pending_balance   = COALESCE(t.pending,0),
         available_balance = GREATEST(0, COALESCE(t.released,0) - COALESCE(t.frozen,0) + COALESCE(t.unfrozen,0)),
         blocked_balance   = GREATEST(0, COALESCE(t.frozen,0) - COALESCE(t.unfrozen,0) - COALESCE(t.withdrawn,0)),
         total_earned      = GREATEST(0, COALESCE(t.pending,0) + COALESCE(t.released,0) + COALESCE(t.refunded_negatives,0)),
         total_withdrawn   = COALESCE(t.withdrawn_abs,0),
         updated_at        = now()
    FROM (
      SELECT
        creator_id,
        SUM(CASE WHEN type='credit_pending' THEN amount ELSE 0 END)
          - SUM(CASE WHEN type='release' THEN amount ELSE 0 END)
          + SUM(CASE WHEN type IN ('refund','chargeback') THEN amount ELSE 0 END)  -- amount já vem negativo
          AS pending,
        SUM(CASE WHEN type='release' THEN amount ELSE 0 END) AS released,
        SUM(CASE WHEN type='freeze' THEN amount ELSE 0 END)  AS frozen,
        SUM(CASE WHEN type='unfreeze' THEN amount ELSE 0 END) AS unfrozen,
        SUM(CASE WHEN type='withdrawal' THEN amount ELSE 0 END) AS withdrawn,         -- negativo
        SUM(CASE WHEN type='withdrawal' THEN -amount ELSE 0 END) AS withdrawn_abs,    -- positivo
        SUM(CASE WHEN type IN ('refund','chargeback') THEN amount ELSE 0 END) AS refunded_negatives
      FROM public.oculto_wallet_ledger
      GROUP BY creator_id
    ) t
   WHERE w.creator_id = t.creator_id;
END $$;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- VALIDAÇÃO RÁPIDA (rode após a migração):
--   SELECT * FROM public.oculto_creator_wallets ORDER BY total_earned DESC LIMIT 10;
--   SELECT type, COUNT(*), SUM(amount) FROM public.oculto_wallet_ledger GROUP BY type;
-- =====================================================================
