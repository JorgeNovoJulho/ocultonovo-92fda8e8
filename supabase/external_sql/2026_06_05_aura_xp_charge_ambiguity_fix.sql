-- ============================================================
-- HOTFIX — public.aura_xp_interaction_charge
-- Resolve: "column reference 'actor_cost' is ambiguous"
-- Causa: RETURNS TABLE expõe OUT params (actor_cost, receiver_reward)
-- com os mesmos nomes das colunas de aura_xp_interaction_config.
-- Solução: qualificar referências com alias da tabela.
-- 100% idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

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
    SELECT COALESCE(g.billing_enabled, true) INTO v_billing
      FROM public.aura_xp_global_config g LIMIT 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_billing := true;
  END;

  BEGIN
    SELECT COALESCE(c.actor_cost, 0), COALESCE(c.receiver_reward, 0), COALESCE(c.enabled, true)
      INTO v_cost, v_reward, v_enabled
      FROM public.aura_xp_interaction_config c
     WHERE c.action_key = p_action_key
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_cost := 0; v_reward := 0; v_enabled := true;
  END;

  IF NOT v_enabled OR NOT COALESCE(v_billing, true) THEN
    v_cost := 0; v_reward := 0;
  END IF;

  IF v_receiver IS NULL AND p_post_id IS NOT NULL THEN
    BEGIN
      SELECT p.author_id INTO v_receiver FROM public.posts p WHERE p.id = p_post_id LIMIT 1;
    EXCEPTION WHEN undefined_column THEN
      SELECT p.user_id INTO v_receiver FROM public.posts p WHERE p.id = p_post_id LIMIT 1;
    END;
  END IF;

  IF p_ref_key IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.xp_transactions x
       WHERE x.user_id = v_uid AND x.reference_id = p_ref_key
    ) INTO v_already;
  END IF;

  SELECT COALESCE(pr.aura_xp, 0) INTO v_actor_bal
    FROM public.profiles pr WHERE pr.user_id = v_uid OR pr.id = v_uid LIMIT 1;

  IF v_already THEN
    IF v_receiver IS NOT NULL THEN
      SELECT COALESCE(pr.aura_xp, 0) INTO v_recv_bal
        FROM public.profiles pr WHERE pr.user_id = v_receiver OR pr.id = v_receiver LIMIT 1;
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
    UPDATE public.profiles pr
       SET aura_xp = COALESCE(pr.aura_xp, 0) - v_cost
     WHERE pr.user_id = v_uid OR pr.id = v_uid
     RETURNING COALESCE(pr.aura_xp, 0) INTO v_actor_bal;

    BEGIN
      INSERT INTO public.xp_transactions (user_id, amount, action_type, description, reference_id)
      VALUES (v_uid, -v_cost, p_action_key, 'debit:'||p_action_key, p_ref_key);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;

  IF v_receiver IS NOT NULL AND v_reward <> 0 THEN
    UPDATE public.profiles pr
       SET aura_xp = COALESCE(pr.aura_xp, 0) + v_reward
     WHERE pr.user_id = v_receiver OR pr.id = v_receiver
     RETURNING COALESCE(pr.aura_xp, 0) INTO v_recv_bal;

    BEGIN
      INSERT INTO public.xp_transactions (user_id, amount, action_type, description, reference_id)
      VALUES (v_receiver, v_reward, p_action_key, 'credit:'||p_action_key,
              CASE WHEN p_ref_key IS NULL THEN NULL ELSE p_ref_key || ':r' END);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  ELSIF v_receiver IS NOT NULL THEN
    SELECT COALESCE(pr.aura_xp, 0) INTO v_recv_bal
      FROM public.profiles pr WHERE pr.user_id = v_receiver OR pr.id = v_receiver LIMIT 1;
  END IF;

  RETURN QUERY SELECT true, 'ok'::text, v_cost, v_reward, v_actor_bal, COALESCE(v_recv_bal, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.aura_xp_interaction_charge(text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_charge(text, uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
