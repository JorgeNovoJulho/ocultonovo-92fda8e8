-- ============================================================
-- 2026_06_02_caixa_oculta_antifraude.sql
-- Reforça antifraude e elegibilidade na participação da Caixa Oculta.
-- Mantém compatibilidade com cox_draw / cox_participate anteriores.
-- 100% idempotente.
-- ============================================================

-- ---------- 1) Helper: usuário elegível para participar ----
-- Bloqueia: usuário não autenticado, banido, suspenso, congelado por fraude.
-- Usa apenas colunas existentes (verificadas com COALESCE para tolerar ausência).
CREATE OR REPLACE FUNCTION public.cox_is_eligible_participant(_uid uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_banned boolean := false;
  v_frozen boolean := false;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;

  -- banido / suspenso (colunas opcionais)
  BEGIN
    SELECT COALESCE(p.is_banned,false) OR COALESCE(p.is_suspended,false)
      INTO v_banned
      FROM public.profiles p
     WHERE p.id = _uid OR p.user_id = _uid
     LIMIT 1;
  EXCEPTION WHEN undefined_column THEN
    v_banned := false;
  END;

  -- antifraude (fraud_frozen_until)
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE (p.id = _uid OR p.user_id = _uid)
         AND p.fraud_frozen_until IS NOT NULL
         AND p.fraud_frozen_until > now()
    ) INTO v_frozen;
  EXCEPTION WHEN undefined_column THEN
    v_frozen := false;
  END;

  RETURN NOT v_banned AND NOT v_frozen;
END $$;

REVOKE ALL ON FUNCTION public.cox_is_eligible_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cox_is_eligible_participant(uuid) TO authenticated, service_role;

-- ---------- 2) cox_participate: adiciona checagem antifraude
-- Reescreve mantendo todo o comportamento anterior + bloqueio de inelegível.
CREATE OR REPLACE FUNCTION public.cox_participate(p_campaign_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_camp public.oculto_caixa_oculta_campaigns;
  v_balance int;
  v_entry_no int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason','unauthenticated');
  END IF;

  IF NOT public.cox_is_eligible_participant(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason','ineligible_account');
  END IF;

  SELECT * INTO v_camp FROM public.oculto_caixa_oculta_campaigns
   WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason','not_found'); END IF;

  IF v_camp.approval_status <> 'approved' OR v_camp.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason','not_open');
  END IF;
  IF v_camp.draw_at <= NOW() OR v_camp.winners_drawn THEN
    RETURN jsonb_build_object('ok', false, 'reason','closed');
  END IF;
  IF v_camp.creator_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason','creator_cannot_participate');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.oculto_caixa_oculta_entries
     WHERE campaign_id = p_campaign_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason','already_participating');
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance
    FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance < v_camp.xp_cost THEN
    RETURN jsonb_build_object('ok', false, 'reason','insufficient_xp',
      'balance', v_balance, 'required', v_camp.xp_cost);
  END IF;

  UPDATE public.profiles SET balance = v_balance - v_camp.xp_cost WHERE id = v_uid;

  v_entry_no := v_camp.participants_count + 1;
  INSERT INTO public.oculto_caixa_oculta_entries
    (campaign_id, user_id, profile_id, xp_spent, entry_number)
  VALUES (p_campaign_id, v_uid, v_uid, v_camp.xp_cost, v_entry_no);

  UPDATE public.oculto_caixa_oculta_campaigns
     SET participants_count = v_entry_no, updated_at = NOW()
   WHERE id = p_campaign_id;

  INSERT INTO public.oculto_caixa_oculta_audit_logs
    (campaign_id, actor_id, action, new_data)
  VALUES (p_campaign_id, v_uid, 'entry_created',
    jsonb_build_object('entry_number', v_entry_no, 'xp_spent', v_camp.xp_cost));

  RETURN jsonb_build_object('ok', true,
    'entry_number', v_entry_no,
    'xp_spent', v_camp.xp_cost,
    'balance_after', v_balance - v_camp.xp_cost);
END $$;

REVOKE ALL ON FUNCTION public.cox_participate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cox_participate(uuid) TO authenticated;

-- ---------- 3) Detector de velocidade suspeita ------------
-- Se uma mesma conta entrar em > N campanhas em < 5 min, registra
-- evento em fraud_events (quando a tabela existir).
CREATE OR REPLACE FUNCTION public._cox_detect_entry_velocity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.oculto_caixa_oculta_entries
   WHERE user_id = NEW.user_id
     AND created_at > now() - interval '5 minutes';

  IF v_count >= 6 THEN
    BEGIN
      PERFORM public.register_fraud_event(
        NEW.user_id, 'cox_entry_burst', 'medium', 10,
        jsonb_build_object('count_5min', v_count, 'campaign_id', NEW.campaign_id)
      );
    EXCEPTION WHEN undefined_function THEN
      NULL; -- camada antifraude global não instalada; ignora silenciosamente
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cox_entry_velocity ON public.oculto_caixa_oculta_entries;
CREATE TRIGGER trg_cox_entry_velocity
AFTER INSERT ON public.oculto_caixa_oculta_entries
FOR EACH ROW EXECUTE FUNCTION public._cox_detect_entry_velocity();

NOTIFY pgrst, 'reload schema';
