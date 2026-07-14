-- Aura Match: Random pool quota + Super DM paid flow
-- Idempotent. Execute no SQL Editor do Supabase EXTERNO.

-- ============================================================
-- 1) Cota diária de randomização (10/dia)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.aura_randomize_quota (
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.aura_randomize_quota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own quota" ON public.aura_randomize_quota;
CREATE POLICY "users see own quota" ON public.aura_randomize_quota
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.consume_aura_randomize()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_limit int := 10;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated', 'remaining', 0);
  END IF;

  INSERT INTO public.aura_randomize_quota (user_id, day, count, updated_at)
  VALUES (v_uid, v_day, 0, now())
  ON CONFLICT (user_id, day) DO NOTHING;

  SELECT count INTO v_count FROM public.aura_randomize_quota
  WHERE user_id = v_uid AND day = v_day FOR UPDATE;

  IF v_count >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'remaining', 0, 'limit', v_limit);
  END IF;

  UPDATE public.aura_randomize_quota
    SET count = count + 1, updated_at = now()
    WHERE user_id = v_uid AND day = v_day;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', v_limit - (v_count + 1),
    'limit', v_limit,
    'count', v_count + 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_aura_randomize() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_aura_randomize_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_limit int := 10;
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('remaining', v_limit, 'limit', v_limit, 'count', 0);
  END IF;
  SELECT count INTO v_count FROM public.aura_randomize_quota
    WHERE user_id = v_uid AND day = v_day;
  v_count := COALESCE(v_count, 0);
  RETURN jsonb_build_object(
    'remaining', GREATEST(0, v_limit - v_count),
    'limit', v_limit,
    'count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_aura_randomize_status() TO authenticated;

-- ============================================================
-- 2) Super DM payments (R$ 4,99 — 100% plataforma)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.super_dm_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid NOT NULL,
  sender_profile_id uuid NOT NULL,
  target_profile_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 4.99,
  asaas_charge_id text,
  payment_method text DEFAULT 'pix',
  status text NOT NULL DEFAULT 'pending', -- pending|paid|failed|refunded
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_super_dm_payments_sender ON public.super_dm_payments(sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_super_dm_payments_charge ON public.super_dm_payments(asaas_charge_id);

ALTER TABLE public.super_dm_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sender reads own super_dm_payments" ON public.super_dm_payments;
CREATE POLICY "sender reads own super_dm_payments" ON public.super_dm_payments
  FOR SELECT USING (auth.uid() = sender_user_id);
