-- =====================================================================
-- Sala Mineração — XP por mensagem (mostradores em tempo real)
-- 1) Adiciona coluna message_id no ledger
-- 2) Recria _mining_credit_xp e aura_room_mining_award com param p_message_id
-- 3) Nova RPC aura_room_mining_message_xp(slug, ids[]) para agregação
-- Idempotente — pode rodar várias vezes.
-- =====================================================================

-- ============== 1) Coluna message_id no ledger ==============
ALTER TABLE public.oculto_aura_room_mining_ledger
  ADD COLUMN IF NOT EXISTS message_id uuid;

CREATE INDEX IF NOT EXISTS idx_mining_ledger_slug_message
  ON public.oculto_aura_room_mining_ledger (slug, message_id)
  WHERE message_id IS NOT NULL;

-- ============== 2) Recria _mining_credit_xp com message_id ==============
DROP FUNCTION IF EXISTS public._mining_credit_xp(uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public._mining_credit_xp(
  p_user_id uuid, p_slug text, p_rule_key text, p_ref_key text,
  p_meta jsonb, p_message_id uuid DEFAULT NULL
) RETURNS TABLE(ok boolean, reason text, awarded integer, balance integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount integer;
  v_enabled boolean;
  v_new_xp integer;
  v_has_xp boolean;
  v_has_level_fn boolean;
BEGIN
  SELECT r.amount, r.enabled INTO v_amount, v_enabled
    FROM public.oculto_aura_room_mining_rules r
   WHERE r.rule_key = p_rule_key;

  IF v_amount IS NULL THEN
    ok := false; reason := 'unknown_rule'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
  END IF;
  IF v_enabled IS DISTINCT FROM true THEN
    ok := false; reason := 'disabled'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.oculto_aura_room_mining_ledger
      (user_id, slug, rule_key, amount, ref_key, meta, message_id)
    VALUES (p_user_id, p_slug, p_rule_key, v_amount, p_ref_key, p_meta, p_message_id);
  EXCEPTION WHEN unique_violation THEN
    SELECT COALESCE(aura_xp, 0) INTO balance FROM public.profiles WHERE user_id = p_user_id;
    ok := false; reason := 'already_awarded'; awarded := 0;
    RETURN NEXT; RETURN;
  END;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='aura_xp'
  ) INTO v_has_xp;

  IF NOT v_has_xp THEN
    ok := true; reason := 'no_xp_column'; awarded := v_amount; balance := 0;
    RETURN NEXT; RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='aura_level_from_xp'
  ) INTO v_has_level_fn;

  IF v_has_level_fn THEN
    UPDATE public.profiles
       SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + v_amount),
           aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp,0) + v_amount))
     WHERE user_id = p_user_id
     RETURNING aura_xp INTO v_new_xp;
  ELSE
    UPDATE public.profiles
       SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + v_amount)
     WHERE user_id = p_user_id
     RETURNING aura_xp INTO v_new_xp;
  END IF;

  ok := true; reason := 'credited'; awarded := v_amount; balance := COALESCE(v_new_xp, 0);
  RETURN NEXT;
END; $$;

-- ============== 3) Recria aura_room_mining_award com p_message_id ==============
DROP FUNCTION IF EXISTS public.aura_room_mining_award(text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.aura_room_mining_award(text, text, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.aura_room_mining_award(
  p_slug text,
  p_rule_key text,
  p_ref_key text,
  p_target_user_id uuid DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_message_id uuid DEFAULT NULL
) RETURNS TABLE(ok boolean, reason text, awarded integer, balance integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_recipient uuid;
  v_msg       text;
  v_distinct  integer;
  v_recent    integer;
  v_last_at   timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    ok := false; reason := 'auth_required'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
  END IF;

  v_recipient := COALESCE(p_target_user_id, v_uid);

  IF p_rule_key = 'per_quality_message' THEN
    v_msg := lower(btrim(COALESCE(p_message, '')));

    IF length(v_msg) < 12 THEN
      ok := false; reason := 'msg_too_short'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    SELECT count(DISTINCT w) INTO v_distinct
      FROM regexp_split_to_table(v_msg, '\s+') AS w
      WHERE length(w) > 1;
    IF v_distinct < 3 THEN
      ok := false; reason := 'msg_low_diversity'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    IF v_msg ~ '^(oi+|ola+|olá+|opa+|eai+|e ai+|hey+|hi+|kk+|haha+|rsrs+|hahaha+)\s*[\.\!\?]*$' THEN
      ok := false; reason := 'msg_blacklisted'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    SELECT max(created_at) INTO v_last_at
      FROM public.oculto_aura_room_mining_ledger
     WHERE user_id = v_uid AND slug = p_slug AND rule_key = 'per_quality_message';
    IF v_last_at IS NOT NULL AND now() - v_last_at < interval '20 seconds' THEN
      ok := false; reason := 'rate_limited'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    SELECT count(*) INTO v_recent
      FROM public.oculto_aura_room_mining_ledger l
     WHERE l.user_id = v_uid
       AND l.slug = p_slug
       AND l.rule_key = 'per_quality_message'
       AND l.created_at > now() - interval '10 minutes'
       AND similarity(lower(COALESCE(l.meta->>'msg','')), v_msg) > 0.75;
    IF v_recent > 0 THEN
      ok := false; reason := 'msg_repetitive'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    RETURN QUERY
      SELECT * FROM public._mining_credit_xp(
        v_uid, p_slug, p_rule_key, p_ref_key,
        jsonb_build_object('msg', v_msg),
        p_message_id
      );
    RETURN;
  END IF;

  RETURN QUERY
    SELECT * FROM public._mining_credit_xp(
      v_recipient, p_slug, p_rule_key, p_ref_key,
      jsonb_build_object('actor', v_uid),
      p_message_id
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.aura_room_mining_award(text, text, text, uuid, text, uuid)
  TO authenticated;

-- ============== 4) RPC: agregação de XP por mensagem ==============
-- Retorna SUM(amount) por message_id para uma sala dada uma lista de IDs.
-- SECURITY DEFINER bypassa RLS do ledger (que limita a SELECT-própria).
-- Mostra a soma de TODAS as formas de pontuar associadas àquela mensagem,
-- independente do usuário recebedor (ex: autor da mensagem ganha por likes
-- recebidos, mas a soma considera todos os créditos referentes ao msg_id).
CREATE OR REPLACE FUNCTION public.aura_room_mining_message_xp(
  p_slug text,
  p_message_ids uuid[]
) RETURNS TABLE(message_id uuid, total_xp integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.message_id,
         COALESCE(SUM(GREATEST(l.amount, 0)), 0)::integer AS total_xp
    FROM public.oculto_aura_room_mining_ledger l
   WHERE l.slug = p_slug
     AND l.message_id = ANY(p_message_ids)
   GROUP BY l.message_id;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_mining_message_xp(text, uuid[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
