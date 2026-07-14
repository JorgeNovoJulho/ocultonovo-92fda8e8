-- =====================================================================
-- Aura Match — Atenções: cooldown detalhado + histórico
-- Atualiza aura_send_attention para devolver cooldown_seconds_left
-- e cria aura_attentions_history (sent + received) e aura_attention_status
-- (consulta sem efeito colateral: saldo, custo, cooldown).
-- 100% idempotente.
-- =====================================================================

-- Drop versão antiga para alterar a assinatura (RETURNS TABLE muda).
DROP FUNCTION IF EXISTS public.aura_send_attention(uuid);

CREATE OR REPLACE FUNCTION public.aura_send_attention(p_target_user_id uuid)
RETURNS TABLE(
  ok                   boolean,
  cost_xp              integer,
  remaining_xp         integer,
  message              text,
  cooldown_seconds_left integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_cost    integer;
  v_balance integer;
  v_last_at timestamptz;
  v_left    integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'invalid target';
  END IF;

  SELECT COALESCE((value)::int, 50) INTO v_cost
    FROM public.oculto_aura_settings WHERE key = 'attention_cost_xp';
  v_cost := COALESCE(v_cost, 50);

  SELECT COALESCE(aura_xp, 0) INTO v_balance
    FROM public.profiles WHERE user_id = v_uid;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  IF v_balance < v_cost THEN
    ok := false; cost_xp := v_cost; remaining_xp := v_balance;
    message := 'XP insuficiente'; cooldown_seconds_left := 0;
    RETURN NEXT; RETURN;
  END IF;

  -- Cooldown: 6h por par sender→target
  SELECT max(created_at) INTO v_last_at
    FROM public.oculto_aura_attentions
   WHERE sender_id = v_uid AND target_id = p_target_user_id;

  IF v_last_at IS NOT NULL AND v_last_at > now() - interval '6 hours' THEN
    v_left := GREATEST(0, EXTRACT(EPOCH FROM ((v_last_at + interval '6 hours') - now()))::int);
    ok := false; cost_xp := v_cost; remaining_xp := v_balance;
    message := 'Cooldown ativo';
    cooldown_seconds_left := v_left;
    RETURN NEXT; RETURN;
  END IF;

  PERFORM public.aura_award_xp(-v_cost, 'attention:' || p_target_user_id::text);

  INSERT INTO public.oculto_aura_attentions (sender_id, target_id, cost_xp)
  VALUES (v_uid, p_target_user_id, v_cost);

  SELECT COALESCE(aura_xp,0) INTO v_balance FROM public.profiles WHERE user_id = v_uid;

  ok := true; cost_xp := v_cost; remaining_xp := v_balance;
  message := 'Atenção enviada'; cooldown_seconds_left := 21600; -- 6h
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_send_attention(uuid) TO authenticated;

-- ============== Status sem efeito colateral (para a UI) ==============
DROP FUNCTION IF EXISTS public.aura_attention_status(uuid);

CREATE OR REPLACE FUNCTION public.aura_attention_status(p_target_user_id uuid)
RETURNS TABLE(
  cost_xp               integer,
  balance_xp            integer,
  has_enough            boolean,
  cooldown_seconds_left integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_cost    integer;
  v_balance integer;
  v_last_at timestamptz;
  v_left    integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT COALESCE((value)::int, 50) INTO v_cost
    FROM public.oculto_aura_settings WHERE key = 'attention_cost_xp';
  v_cost := COALESCE(v_cost, 50);

  SELECT COALESCE(aura_xp,0) INTO v_balance
    FROM public.profiles WHERE user_id = v_uid;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  IF p_target_user_id IS NOT NULL AND p_target_user_id <> v_uid THEN
    SELECT max(created_at) INTO v_last_at
      FROM public.oculto_aura_attentions
     WHERE sender_id = v_uid AND target_id = p_target_user_id;
    IF v_last_at IS NOT NULL AND v_last_at > now() - interval '6 hours' THEN
      v_left := GREATEST(0, EXTRACT(EPOCH FROM ((v_last_at + interval '6 hours') - now()))::int);
    END IF;
  END IF;

  cost_xp := v_cost;
  balance_xp := v_balance;
  has_enough := v_balance >= v_cost;
  cooldown_seconds_left := v_left;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_attention_status(uuid) TO authenticated;

-- ============== Histórico (enviadas + recebidas) ==============
DROP FUNCTION IF EXISTS public.aura_attentions_history(integer);

CREATE OR REPLACE FUNCTION public.aura_attentions_history(p_limit integer DEFAULT 30)
RETURNS TABLE(
  id              uuid,
  direction       text,         -- 'sent' | 'received'
  other_user_id   uuid,
  other_username  text,
  other_name      text,
  other_avatar    text,
  cost_xp         integer,
  created_at      timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim integer := COALESCE(p_limit, 30);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_lim < 1 THEN v_lim := 30; END IF;
  IF v_lim > 100 THEN v_lim := 100; END IF;

  RETURN QUERY
  SELECT
    a.id,
    CASE WHEN a.sender_id = v_uid THEN 'sent' ELSE 'received' END AS direction,
    CASE WHEN a.sender_id = v_uid THEN a.target_id ELSE a.sender_id END AS other_user_id,
    p.username,
    COALESCE(p.display_name, p.username) AS other_name,
    p.avatar_url,
    a.cost_xp,
    a.created_at
  FROM public.oculto_aura_attentions a
  LEFT JOIN public.profiles p
    ON p.user_id = CASE WHEN a.sender_id = v_uid THEN a.target_id ELSE a.sender_id END
  WHERE a.sender_id = v_uid OR a.target_id = v_uid
  ORDER BY a.created_at DESC
  LIMIT v_lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_attentions_history(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
