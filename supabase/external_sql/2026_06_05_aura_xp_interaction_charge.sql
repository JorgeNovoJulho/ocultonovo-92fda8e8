-- ============================================================
-- Oculto — RPC public.aura_xp_interaction_charge (EXTERNAL Supabase)
-- Cria xp_transactions se faltar, garante colunas mínimas e cria o RPC.
-- 100% idempotente. Rodar no SQL Editor do Supabase externo.
-- ============================================================

-- 0) Garante tabela xp_transactions (estrutura mínima)
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  amount       integer NOT NULL DEFAULT 0,
  action_type  text,
  description  text,
  reference_id text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Garante colunas, caso a tabela já exista com schema diferente
ALTER TABLE public.xp_transactions ADD COLUMN IF NOT EXISTS action_type  text;
ALTER TABLE public.xp_transactions ADD COLUMN IF NOT EXISTS description  text;
ALTER TABLE public.xp_transactions ADD COLUMN IF NOT EXISTS reference_id text;
ALTER TABLE public.xp_transactions ADD COLUMN IF NOT EXISTS amount       integer NOT NULL DEFAULT 0;

GRANT SELECT, INSERT ON public.xp_transactions TO authenticated;
GRANT ALL ON public.xp_transactions TO service_role;

ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='xp_transactions' AND policyname='xp_tx_self_select'
  ) THEN
    CREATE POLICY xp_tx_self_select ON public.xp_transactions
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- Índice único p/ idempotência por (user_id, reference_id)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_xp_tx_user_ref
  ON public.xp_transactions (user_id, reference_id)
  WHERE reference_id IS NOT NULL;

-- 1) Garante aura_xp em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aura_xp integer NOT NULL DEFAULT 0;

-- 2) RPC
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_charge(
  p_action_key  text,
  p_post_id     uuid DEFAULT NULL,
  p_receiver_id uuid DEFAULT NULL,
  p_ref_key     text DEFAULT NULL
)
RETURNS TABLE (
  ok               boolean,
  reason           text,
  actor_cost       integer,
  receiver_reward  integer,
  actor_balance    integer,
  receiver_balance integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_cost      integer := 0;
  v_reward    integer := 0;
  v_enabled   boolean := true;
  v_billing   boolean := true;
  v_receiver  uuid := p_receiver_id;
  v_actor_bal integer := 0;
  v_recv_bal  integer := 0;
  v_already   boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'auth_required'::text, 0, 0, 0, 0;
    RETURN;
  END IF;

  BEGIN
    SELECT COALESCE(billing_enabled, true) INTO v_billing
      FROM public.aura_xp_global_config LIMIT 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_billing := true;
  END;

  BEGIN
    SELECT COALESCE(actor_cost, 0), COALESCE(receiver_reward, 0), COALESCE(enabled, true)
      INTO v_cost, v_reward, v_enabled
      FROM public.aura_xp_interaction_config
     WHERE action_key = p_action_key
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_cost := 0; v_reward := 0; v_enabled := true;
  END;

  IF NOT v_enabled OR NOT COALESCE(v_billing, true) THEN
    v_cost := 0; v_reward := 0;
  END IF;

  IF v_receiver IS NULL AND p_post_id IS NOT NULL THEN
    BEGIN
      SELECT author_id INTO v_receiver FROM public.posts WHERE id = p_post_id LIMIT 1;
    EXCEPTION WHEN undefined_column THEN
      SELECT user_id INTO v_receiver FROM public.posts WHERE id = p_post_id LIMIT 1;
    END;
  END IF;

  IF p_ref_key IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.xp_transactions
       WHERE user_id = v_uid AND reference_id = p_ref_key
    ) INTO v_already;
  END IF;

  SELECT COALESCE(aura_xp, 0) INTO v_actor_bal
    FROM public.profiles WHERE user_id = v_uid OR id = v_uid LIMIT 1;

  IF v_already THEN
    IF v_receiver IS NOT NULL THEN
      SELECT COALESCE(aura_xp, 0) INTO v_recv_bal
        FROM public.profiles WHERE user_id = v_receiver OR id = v_receiver LIMIT 1;
    END IF;
    RETURN QUERY SELECT true, 'already_charged'::text, v_cost, v_reward, v_actor_bal, COALESCE(v_recv_bal, 0);
    RETURN;
  END IF;

  IF v_receiver IS NOT NULL AND v_receiver = v_uid THEN
    RETURN QUERY SELECT true, 'self_action'::text, 0, 0, v_actor_bal, v_actor_bal;
    RETURN;
  END IF;

  IF v_cost > 0 AND v_actor_bal < v_cost THEN
    RETURN QUERY SELECT false, 'insufficient_xp'::text, v_cost, v_reward, v_actor_bal, 0;
    RETURN;
  END IF;

  IF v_cost > 0 THEN
    UPDATE public.profiles
       SET aura_xp = COALESCE(aura_xp, 0) - v_cost
     WHERE user_id = v_uid OR id = v_uid
     RETURNING COALESCE(aura_xp, 0) INTO v_actor_bal;

    BEGIN
      INSERT INTO public.xp_transactions (user_id, amount, action_type, description, reference_id)
      VALUES (v_uid, -v_cost, p_action_key, 'debit:'||p_action_key, p_ref_key);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;

  IF v_receiver IS NOT NULL AND v_reward <> 0 THEN
    UPDATE public.profiles
       SET aura_xp = COALESCE(aura_xp, 0) + v_reward
     WHERE user_id = v_receiver OR id = v_receiver
     RETURNING COALESCE(aura_xp, 0) INTO v_recv_bal;

    BEGIN
      INSERT INTO public.xp_transactions (user_id, amount, action_type, description, reference_id)
      VALUES (v_receiver, v_reward, p_action_key, 'credit:'||p_action_key,
              CASE WHEN p_ref_key IS NULL THEN NULL ELSE p_ref_key || ':r' END);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  ELSIF v_receiver IS NOT NULL THEN
    SELECT COALESCE(aura_xp, 0) INTO v_recv_bal
      FROM public.profiles WHERE user_id = v_receiver OR id = v_receiver LIMIT 1;
  END IF;

  RETURN QUERY SELECT true, 'ok'::text, v_cost, v_reward, v_actor_bal, COALESCE(v_recv_bal, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.aura_xp_interaction_charge(text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_charge(text, uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
