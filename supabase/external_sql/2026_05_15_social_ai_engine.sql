-- =====================================================================
-- PRIORIDADE 4 — IA SOCIAL (engine leve, por regras, explicável, LGPD-safe)
-- Sem IA pesada. Sem chamadas externas. Backend é fonte da verdade.
-- Respeita consent `cookies_personalization` do LGPD.
-- =====================================================================

-- 1) Config singleton ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_social_ai_config (
  id text PRIMARY KEY DEFAULT 'singleton',
  enabled            boolean NOT NULL DEFAULT true,
  max_suggestions    int     NOT NULL DEFAULT 2,
  cooldown_minutes   int     NOT NULL DEFAULT 240, -- 4h entre sugestões iguais
  rules_enabled      jsonb   NOT NULL DEFAULT '{
    "never_used_aura": true,
    "vip_creator_hint": true,
    "inactive_noite_oculta": true,
    "high_score_rare_rooms": true,
    "low_score_complete_profile": true,
    "checkout_abandoned": true,
    "premium_value_hint": true
  }'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.oculto_social_ai_config(id) VALUES ('singleton') ON CONFLICT DO NOTHING;

ALTER TABLE public.oculto_social_ai_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_config read all" ON public.oculto_social_ai_config;
CREATE POLICY "ai_config read all" ON public.oculto_social_ai_config FOR SELECT TO authenticated USING (true);

-- 2) Telemetria leve (anonimizada) -------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_social_ai_events (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL,
  rule_key     text NOT NULL,
  action       text NOT NULL CHECK (action IN ('shown','clicked','dismissed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_events_user_rule ON public.oculto_social_ai_events(user_id, rule_key, created_at DESC);

ALTER TABLE public.oculto_social_ai_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_events insert self" ON public.oculto_social_ai_events;
CREATE POLICY "ai_events insert self" ON public.oculto_social_ai_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "ai_events read self" ON public.oculto_social_ai_events;
CREATE POLICY "ai_events read self" ON public.oculto_social_ai_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- purge automático (>30 dias)
CREATE OR REPLACE FUNCTION public.social_ai_events_purge()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.oculto_social_ai_events WHERE created_at < now() - interval '30 days';
$$;
GRANT EXECUTE ON FUNCTION public.social_ai_events_purge() TO authenticated;

-- 3) Helper: opt-out check (cookies_personalization) -------------------
CREATE OR REPLACE FUNCTION public._social_ai_consented(_uid uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean := true;
BEGIN
  BEGIN
    SELECT COALESCE(granted,true) INTO v
      FROM public.lgpd_consents
      WHERE user_id = _uid AND consent_type = 'cookies_personalization'
      ORDER BY granted_at DESC LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v := true;
  END;
  RETURN COALESCE(v,true);
END$$;
GRANT EXECUTE ON FUNCTION public._social_ai_consented(uuid) TO authenticated;

-- 4) RPC principal: recomendações por regras ---------------------------
-- Retorna jsonb array: [{key,title,body,cta,route,reason,weight}]
CREATE OR REPLACE FUNCTION public.social_ai_recommend(p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := COALESCE(p_user, auth.uid());
  v_cfg     public.oculto_social_ai_config;
  v_out     jsonb := '[]'::jsonb;
  v_score   int := 0;
  v_aura    int := 0;
  v_plan    text := 'free';
  v_last_seen timestamptz;
  v_used_aura boolean := false;
  v_abandoned boolean := false;
  v_cooldown_ts timestamptz;
  v_rules   jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN v_out; END IF;
  IF NOT public._social_ai_consented(v_uid) THEN RETURN v_out; END IF;

  SELECT * INTO v_cfg FROM public.oculto_social_ai_config WHERE id='singleton';
  IF NOT COALESCE(v_cfg.enabled,false) THEN RETURN v_out; END IF;
  v_rules := v_cfg.rules_enabled;
  v_cooldown_ts := now() - make_interval(mins => v_cfg.cooldown_minutes);

  -- snapshot social
  BEGIN
    SELECT COALESCE((s->>'score')::int,0), COALESCE((s->>'aura_level')::int,0)
      INTO v_score, v_aura
      FROM (SELECT public.social_core_identity_get(v_uid) AS s) x;
  EXCEPTION WHEN OTHERS THEN v_score := 0; v_aura := 0; END;

  BEGIN
    SELECT COALESCE(plan_type,'free'), last_active_at
      INTO v_plan, v_last_seen
      FROM public.profiles WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN v_plan := 'free'; END;

  -- aura match já usado?
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.aura_match_swipes WHERE swiper_id = v_uid LIMIT 1
    ) INTO v_used_aura;
  EXCEPTION WHEN OTHERS THEN v_used_aura := false; END;

  -- checkout abandonado recente?
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.transactions
      WHERE user_id = v_uid AND status = 'pending'
        AND created_at > now() - interval '7 days'
    ) INTO v_abandoned;
  EXCEPTION WHEN OTHERS THEN v_abandoned := false; END;

  -- ===== REGRAS =====
  -- helper inline: dedup por cooldown
  -- regra: nunca usou Aura
  IF COALESCE((v_rules->>'never_used_aura')::boolean,false) AND NOT v_used_aura
     AND NOT EXISTS (SELECT 1 FROM public.oculto_social_ai_events
                     WHERE user_id=v_uid AND rule_key='never_used_aura' AND action='shown' AND created_at > v_cooldown_ts) THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key','never_used_aura',
      'title','Conheça o Aura Match',
      'body','Encontros guiados pela sua energia social.',
      'cta','Abrir Aura',
      'route','/aura-match',
      'reason','Você ainda não experimentou o Aura.',
      'weight', 80
    ));
  END IF;

  -- regra: VIP — sugerir canal/monetização
  IF COALESCE((v_rules->>'vip_creator_hint')::boolean,false) AND v_plan = 'vip'
     AND NOT EXISTS (SELECT 1 FROM public.oculto_social_ai_events
                     WHERE user_id=v_uid AND rule_key='vip_creator_hint' AND action='shown' AND created_at > v_cooldown_ts) THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key','vip_creator_hint',
      'title','Ative seu Canal VIP',
      'body','Crie planos e monetize sua audiência.',
      'cta','Configurar canal',
      'route','/subscriptions',
      'reason','Você é VIP e pode publicar conteúdo pago.',
      'weight', 70
    ));
  END IF;

  -- regra: inativo (>7d sem login) → Noite Oculta
  IF COALESCE((v_rules->>'inactive_noite_oculta')::boolean,false)
     AND v_last_seen IS NOT NULL AND v_last_seen < now() - interval '7 days'
     AND NOT EXISTS (SELECT 1 FROM public.oculto_social_ai_events
                     WHERE user_id=v_uid AND rule_key='inactive_noite_oculta' AND action='shown' AND created_at > v_cooldown_ts) THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key','inactive_noite_oculta',
      'title','Noite Oculta começa em breve',
      'body','Reaparece nos olhares certos esta noite.',
      'cta','Entrar agora',
      'route','/feed',
      'reason','Sem atividade há mais de 7 dias.',
      'weight', 65
    ));
  END IF;

  -- regra: alto score → salas raras
  IF COALESCE((v_rules->>'high_score_rare_rooms')::boolean,false) AND v_score >= 70
     AND NOT EXISTS (SELECT 1 FROM public.oculto_social_ai_events
                     WHERE user_id=v_uid AND rule_key='high_score_rare_rooms' AND action='shown' AND created_at > v_cooldown_ts) THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key','high_score_rare_rooms',
      'title','Você desbloqueou salas raras',
      'body','Seu prestígio social abriu portas exclusivas.',
      'cta','Ver salas',
      'route','/aura-match',
      'reason','Score social alto.',
      'weight', 60
    ));
  END IF;

  -- regra: baixo score → completar perfil
  IF COALESCE((v_rules->>'low_score_complete_profile')::boolean,false) AND v_score < 25
     AND NOT EXISTS (SELECT 1 FROM public.oculto_social_ai_events
                     WHERE user_id=v_uid AND rule_key='low_score_complete_profile' AND action='shown' AND created_at > v_cooldown_ts) THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key','low_score_complete_profile',
      'title','Complete seu perfil',
      'body','Mais informação = mais conexões certas.',
      'cta','Editar perfil',
      'route','/account',
      'reason','Score social inicial.',
      'weight', 55
    ));
  END IF;

  -- regra: checkout abandonado → retomar
  IF COALESCE((v_rules->>'checkout_abandoned')::boolean,false) AND v_abandoned
     AND NOT EXISTS (SELECT 1 FROM public.oculto_social_ai_events
                     WHERE user_id=v_uid AND rule_key='checkout_abandoned' AND action='shown' AND created_at > v_cooldown_ts) THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key','checkout_abandoned',
      'title','Você deixou algo pendente',
      'body','Finalize sua compra com 1 clique.',
      'cta','Retomar',
      'route','/checkout-resume',
      'reason','Checkout iniciado e não concluído.',
      'weight', 90
    ));
  END IF;

  -- regra: premium value hint (free com bom score)
  IF COALESCE((v_rules->>'premium_value_hint')::boolean,false) AND v_plan = 'free' AND v_score >= 40
     AND NOT EXISTS (SELECT 1 FROM public.oculto_social_ai_events
                     WHERE user_id=v_uid AND rule_key='premium_value_hint' AND action='shown' AND created_at > v_cooldown_ts) THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key','premium_value_hint',
      'title','Desbloqueie o Premium',
      'body','Veja quem te observou e amplie seu alcance.',
      'cta','Ver planos',
      'route','/subscriptions',
      'reason','Você está engajado — Premium destrava mais.',
      'weight', 50
    ));
  END IF;

  -- ordena por weight desc e corta
  RETURN (
    SELECT COALESCE(jsonb_agg(elem ORDER BY (elem->>'weight')::int DESC), '[]'::jsonb)
    FROM (
      SELECT elem FROM jsonb_array_elements(v_out) AS elem
      LIMIT v_cfg.max_suggestions
    ) sub
  );
END$$;
GRANT EXECUTE ON FUNCTION public.social_ai_recommend(uuid) TO authenticated;

-- 5) Telemetria de eventos --------------------------------------------
CREATE OR REPLACE FUNCTION public.social_ai_track(p_rule text, p_action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF p_action NOT IN ('shown','clicked','dismissed') THEN RETURN; END IF;
  INSERT INTO public.oculto_social_ai_events(user_id, rule_key, action)
  VALUES (auth.uid(), p_rule, p_action);
END$$;
GRANT EXECUTE ON FUNCTION public.social_ai_track(text,text) TO authenticated;

-- 6) Churn signals (read-only) ----------------------------------------
CREATE OR REPLACE FUNCTION public.social_ai_churn_signals(p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := COALESCE(p_user, auth.uid());
  v_last timestamptz;
  v_abandoned int := 0;
  v_aura_recent boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;

  BEGIN SELECT last_active_at INTO v_last FROM public.profiles WHERE id=v_uid;
  EXCEPTION WHEN OTHERS THEN v_last := NULL; END;

  BEGIN
    SELECT count(*) INTO v_abandoned FROM public.transactions
    WHERE user_id=v_uid AND status='pending' AND created_at > now() - interval '14 days';
  EXCEPTION WHEN OTHERS THEN v_abandoned := 0; END;

  BEGIN
    SELECT EXISTS(SELECT 1 FROM public.aura_match_swipes
                  WHERE swiper_id=v_uid AND created_at > now() - interval '14 days')
      INTO v_aura_recent;
  EXCEPTION WHEN OTHERS THEN v_aura_recent := false; END;

  RETURN jsonb_build_object(
    'last_active_at', v_last,
    'days_inactive', CASE WHEN v_last IS NULL THEN NULL
                          ELSE EXTRACT(epoch FROM (now()-v_last))/86400 END,
    'pending_checkouts', v_abandoned,
    'aura_active_14d',  v_aura_recent,
    'churn_risk',
      CASE
        WHEN v_last IS NULL OR v_last < now()-interval '14 days' THEN 'high'
        WHEN v_last < now()-interval '7 days' OR v_abandoned > 0  THEN 'medium'
        ELSE 'low'
      END
  );
END$$;
GRANT EXECUTE ON FUNCTION public.social_ai_churn_signals(uuid) TO authenticated;

-- 7) Master config update ---------------------------------------------
CREATE OR REPLACE FUNCTION public.social_ai_config_update(
  p_enabled boolean DEFAULT NULL,
  p_max_suggestions int DEFAULT NULL,
  p_cooldown_minutes int DEFAULT NULL,
  p_rules_enabled jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_master boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  BEGIN SELECT public.has_role(auth.uid(),'master_admin') INTO v_master;
  EXCEPTION WHEN OTHERS THEN
    BEGIN SELECT COALESCE(is_master,false) INTO v_master FROM public.profiles WHERE id=auth.uid();
    EXCEPTION WHEN OTHERS THEN v_master := false; END;
  END;
  IF NOT v_master THEN RAISE EXCEPTION 'forbidden: master only'; END IF;

  UPDATE public.oculto_social_ai_config
     SET enabled          = COALESCE(p_enabled, enabled),
         max_suggestions  = COALESCE(p_max_suggestions, max_suggestions),
         cooldown_minutes = COALESCE(p_cooldown_minutes, cooldown_minutes),
         rules_enabled    = COALESCE(p_rules_enabled, rules_enabled),
         updated_at       = now()
   WHERE id='singleton';

  RETURN (SELECT to_jsonb(c.*) FROM public.oculto_social_ai_config c WHERE c.id='singleton');
END$$;
GRANT EXECUTE ON FUNCTION public.social_ai_config_update(boolean,int,int,jsonb) TO authenticated;

-- 8) Métricas para admin ----------------------------------------------
CREATE OR REPLACE FUNCTION public.social_ai_admin_metrics()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_master boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  BEGIN SELECT public.has_role(auth.uid(),'master_admin') INTO v_master;
  EXCEPTION WHEN OTHERS THEN
    BEGIN SELECT COALESCE(is_master,false) INTO v_master FROM public.profiles WHERE id=auth.uid();
    EXCEPTION WHEN OTHERS THEN v_master := false; END;
  END;
  IF NOT v_master THEN RAISE EXCEPTION 'forbidden: master only'; END IF;

  RETURN jsonb_build_object(
    'shown_7d',     (SELECT count(*) FROM public.oculto_social_ai_events WHERE action='shown'     AND created_at > now()-interval '7 days'),
    'clicked_7d',   (SELECT count(*) FROM public.oculto_social_ai_events WHERE action='clicked'   AND created_at > now()-interval '7 days'),
    'dismissed_7d', (SELECT count(*) FROM public.oculto_social_ai_events WHERE action='dismissed' AND created_at > now()-interval '7 days'),
    'by_rule_7d',   (SELECT COALESCE(jsonb_object_agg(rule_key, c),'{}'::jsonb)
                     FROM (SELECT rule_key, count(*) AS c
                             FROM public.oculto_social_ai_events
                            WHERE created_at > now()-interval '7 days'
                            GROUP BY rule_key) x)
  );
END$$;
GRANT EXECUTE ON FUNCTION public.social_ai_admin_metrics() TO authenticated;
