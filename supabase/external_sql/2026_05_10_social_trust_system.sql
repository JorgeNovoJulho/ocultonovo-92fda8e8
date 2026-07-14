-- ============================================================================
-- SOCIAL & TRUST SYSTEM — Aura Social + Trust Score evoluído
-- 100% idempotente — cole no SQL Editor do Supabase EXTERNO
-- ============================================================================

-- ====== TABELAS ======

CREATE TABLE IF NOT EXISTS public.oculto_social_levels (
  level         int PRIMARY KEY,
  name          text NOT NULL,
  min_xp        int NOT NULL,
  glow_color    text NOT NULL DEFAULT '270 70% 60%',
  perks         jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oculto_social_rules (
  kind              text PRIMARY KEY,
  weight            int NOT NULL DEFAULT 1,
  daily_cap         int NOT NULL DEFAULT 0,           -- 0 = sem cap
  cooldown_seconds  int NOT NULL DEFAULT 0,
  active            boolean NOT NULL DEFAULT true,
  description       text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oculto_social_rewards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_min     int NOT NULL,
  kind          text NOT NULL CHECK (kind IN
                  ('discount_sub','discount_vip','discount_fee',
                   'boost_radar','boost_aura','highlight','custom')),
  value         numeric(10,2) NOT NULL DEFAULT 0,    -- % ou multiplicador
  label         text NOT NULL,
  description   text,
  active        boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oculto_social_scores (
  user_id       uuid PRIMARY KEY,
  total_xp      int NOT NULL DEFAULT 0,
  level         int NOT NULL DEFAULT 1,
  breakdown     jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_at timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oculto_social_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  kind        text NOT NULL,
  weight      int  NOT NULL,
  ref_id      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_events_user_day
  ON public.oculto_social_events (user_id, kind, created_at DESC);

-- ====== RLS ======

ALTER TABLE public.oculto_social_levels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_social_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_social_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_social_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_social_events  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Leitura pública das configs e scores (perfil é público)
  CREATE POLICY social_levels_read  ON public.oculto_social_levels  FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY social_rules_read   ON public.oculto_social_rules   FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY social_rewards_read ON public.oculto_social_rewards FOR SELECT USING (active);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY social_scores_read  ON public.oculto_social_scores  FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY social_events_owner ON public.oculto_social_events  FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ====== SEEDS DOS NÍVEIS ======

INSERT INTO public.oculto_social_levels (level, name, min_xp, glow_color, perks) VALUES
  (1, 'Presença Inicial',  0,     '270 30% 55%',  '[]'::jsonb),
  (2, 'Aura Ativa',        500,   '280 60% 60%',  '["highlight_radar"]'::jsonb),
  (3, 'Perfil Influente',  2000,  '320 70% 60%',  '["highlight_radar","boost_aura"]'::jsonb),
  (4, 'Energia Magnética', 6000,  '40 90% 55%',   '["highlight_radar","boost_aura","discount_vip"]'::jsonb),
  (5, 'Lenda Social',      15000, '45 95% 55%',   '["highlight_radar","boost_aura","discount_vip","discount_sub"]'::jsonb)
ON CONFLICT (level) DO NOTHING;

-- ====== SEEDS DAS REGRAS (pesos / antifraude) ======

INSERT INTO public.oculto_social_rules (kind, weight, daily_cap, cooldown_seconds, description) VALUES
  ('post_created',        25,  10,  60,    'Publicou um post'),
  ('like_received',       2,   200, 0,     'Recebeu uma curtida'),
  ('comment_received',    5,   100, 0,     'Recebeu um comentário'),
  ('follower_gained',     10,  100, 0,     'Ganhou um seguidor'),
  ('match_made',          15,  50,  0,     'Novo match'),
  ('chat_message',        1,   100, 5,     'Enviou mensagem no chat'),
  ('aura_xp_milestone',   20,  20,  0,     'Subiu de nível na Aura'),
  ('vip_subscriber_new',  100, 0,   0,     'Ganhou novo assinante VIP'),
  ('content_sold',        50,  0,   0,     'Vendeu conteúdo PPV'),
  ('payment_approved',    30,  0,   0,     'Pagamento aprovado'),
  ('verification_done',   200, 0,   0,     'Concluiu verificação KYC'),
  ('profile_completed',   100, 0,   0,     'Perfil 100% completo'),
  ('report_valid',       -150, 0,   0,     'Recebeu denúncia válida'),
  ('chargeback',         -300, 0,   0,     'Chargeback confirmado'),
  ('block_received',     -10,  0,   0,     'Foi bloqueado por usuário')
ON CONFLICT (kind) DO NOTHING;

-- ====== SEEDS DAS RECOMPENSAS DINÂMICAS ======

INSERT INTO public.oculto_social_rewards (level_min, kind, value, label, description, active) VALUES
  (2, 'highlight',     1,  'Destaque no Radar',           'Seu perfil aparece com glow especial.',           true),
  (3, 'boost_aura',    1.2,'Boost de Aura',               'Multiplicador de XP no Aura Match.',              true),
  (3, 'boost_radar',   1.3,'Boost no Radar',              'Mais visibilidade nas buscas.',                   true),
  (4, 'discount_vip',  10, '10% OFF assinatura VIP',      'Aplicado no checkout automaticamente.',           true),
  (4, 'discount_fee',  5,  '5% OFF taxa da plataforma',   'Você paga menos taxa nas vendas.',                true),
  (5, 'discount_sub',  20, '20% OFF assinatura mensal',   'Desconto vitalício enquanto manter o nível.',     true)
ON CONFLICT DO NOTHING;

-- ====== TRUST SCORE SETTINGS (pesos editáveis) ======

CREATE TABLE IF NOT EXISTS public.oculto_trust_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oculto_trust_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY trust_settings_read ON public.oculto_trust_settings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.oculto_trust_settings (key, value) VALUES
  ('weights', '{"profile":25,"verification":30,"phone":10,"email":5,"activity":20,"response":10,"age":10,"reports":-30,"chargeback":-50}'::jsonb),
  ('tiers',   '{"excellent":80,"good":60,"regular":40}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- HELPERS / RPCS
-- ============================================================================

-- Master admin check (reaproveita convenção existente do projeto)
CREATE OR REPLACE FUNCTION public._is_master_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.username = 'ocultomaster' OR coalesce(p.is_admin, false) = true)
  );
$$;

-- ====== SOCIAL: GET ======

CREATE OR REPLACE FUNCTION public.social_score_get(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := coalesce(p_user, auth.uid());
  v_xp      int;
  v_lvl     int;
  v_lvl_row record;
  v_next    record;
  v_perks   jsonb;
  v_break   jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','no_user'); END IF;

  SELECT total_xp, level, breakdown INTO v_xp, v_lvl, v_break
    FROM oculto_social_scores WHERE user_id = v_uid;

  IF v_xp IS NULL THEN
    v_xp := 0; v_lvl := 1; v_break := '{}'::jsonb;
  END IF;

  SELECT * INTO v_lvl_row FROM oculto_social_levels WHERE level = v_lvl;
  SELECT * INTO v_next    FROM oculto_social_levels WHERE level = v_lvl + 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kind', r.kind, 'value', r.value, 'label', r.label, 'description', r.description
  )), '[]'::jsonb)
  INTO v_perks
  FROM oculto_social_rewards r
  WHERE r.active AND r.level_min <= v_lvl;

  RETURN jsonb_build_object(
    'user_id', v_uid,
    'xp', v_xp,
    'level', v_lvl,
    'level_name', coalesce(v_lvl_row.name, 'Presença Inicial'),
    'glow_color', coalesce(v_lvl_row.glow_color, '270 30% 55%'),
    'next_level', v_next.level,
    'next_level_name', v_next.name,
    'next_level_xp', v_next.min_xp,
    'progress_pct', CASE
      WHEN v_next.min_xp IS NULL OR v_next.min_xp = v_lvl_row.min_xp THEN 100
      ELSE LEAST(100, GREATEST(0, ROUND(((v_xp - v_lvl_row.min_xp)::numeric * 100) / NULLIF((v_next.min_xp - v_lvl_row.min_xp),0))))
    END,
    'perks', v_perks,
    'breakdown', v_break
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.social_score_get(uuid) TO authenticated, anon;

-- ====== SOCIAL: AWARD (interno, antifraude, sem expor ao client) ======

CREATE OR REPLACE FUNCTION public.social_score_award(
  p_user uuid, p_kind text, p_ref_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rule    record;
  v_count   int;
  v_recent  int;
  v_new_xp  int;
  v_new_lvl int;
  v_is_seed boolean;
BEGIN
  IF p_user IS NULL OR p_kind IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','args'); END IF;

  -- ignora seeds
  SELECT coalesce(is_seed,false) INTO v_is_seed FROM profiles WHERE id = p_user OR user_id = p_user LIMIT 1;
  IF v_is_seed THEN RETURN jsonb_build_object('ok',false,'reason','seed'); END IF;

  SELECT * INTO v_rule FROM oculto_social_rules WHERE kind = p_kind AND active;
  IF v_rule IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','no_rule'); END IF;

  -- daily cap
  IF v_rule.daily_cap > 0 THEN
    SELECT count(*) INTO v_count FROM oculto_social_events
     WHERE user_id = p_user AND kind = p_kind
       AND created_at > now() - interval '1 day';
    IF v_count >= v_rule.daily_cap THEN
      RETURN jsonb_build_object('ok',false,'reason','daily_cap');
    END IF;
  END IF;

  -- cooldown por ref_id
  IF v_rule.cooldown_seconds > 0 AND p_ref_id IS NOT NULL THEN
    SELECT count(*) INTO v_recent FROM oculto_social_events
     WHERE user_id = p_user AND kind = p_kind AND ref_id = p_ref_id
       AND created_at > now() - make_interval(secs => v_rule.cooldown_seconds);
    IF v_recent > 0 THEN
      RETURN jsonb_build_object('ok',false,'reason','cooldown');
    END IF;
  END IF;

  INSERT INTO oculto_social_events(user_id, kind, weight, ref_id)
  VALUES (p_user, p_kind, v_rule.weight, p_ref_id);

  INSERT INTO oculto_social_scores(user_id, total_xp, level, last_event_at)
  VALUES (p_user, GREATEST(0, v_rule.weight), 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET total_xp = GREATEST(0, oculto_social_scores.total_xp + v_rule.weight),
        last_event_at = now(),
        updated_at = now()
  RETURNING total_xp INTO v_new_xp;

  SELECT max(level) INTO v_new_lvl FROM oculto_social_levels WHERE min_xp <= v_new_xp;
  v_new_lvl := coalesce(v_new_lvl, 1);

  UPDATE oculto_social_scores SET level = v_new_lvl WHERE user_id = p_user;

  RETURN jsonb_build_object('ok',true,'xp',v_new_xp,'level',v_new_lvl,'delta',v_rule.weight);
END; $$;

REVOKE ALL ON FUNCTION public.social_score_award(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_score_award(uuid,text,text) TO authenticated;

-- ====== SOCIAL: ADMIN ======

CREATE OR REPLACE FUNCTION public.social_admin_set_rule(
  p_kind text, p_weight int, p_daily_cap int, p_cooldown int, p_active boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO oculto_social_rules(kind, weight, daily_cap, cooldown_seconds, active)
  VALUES (p_kind, p_weight, p_daily_cap, p_cooldown, p_active)
  ON CONFLICT (kind) DO UPDATE
    SET weight = EXCLUDED.weight,
        daily_cap = EXCLUDED.daily_cap,
        cooldown_seconds = EXCLUDED.cooldown_seconds,
        active = EXCLUDED.active,
        updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.social_admin_set_rule(text,int,int,int,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_admin_set_level(
  p_level int, p_name text, p_min_xp int, p_glow text, p_perks jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO oculto_social_levels(level, name, min_xp, glow_color, perks)
  VALUES (p_level, p_name, p_min_xp, coalesce(p_glow,'270 30% 55%'), coalesce(p_perks,'[]'::jsonb))
  ON CONFLICT (level) DO UPDATE
    SET name = EXCLUDED.name, min_xp = EXCLUDED.min_xp,
        glow_color = EXCLUDED.glow_color, perks = EXCLUDED.perks,
        updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.social_admin_set_level(int,text,int,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_admin_set_reward(
  p_id uuid, p_level_min int, p_kind text, p_value numeric, p_label text, p_description text, p_active boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO oculto_social_rewards(level_min, kind, value, label, description, active)
    VALUES (p_level_min, p_kind, p_value, p_label, p_description, p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE oculto_social_rewards
       SET level_min=p_level_min, kind=p_kind, value=p_value, label=p_label,
           description=p_description, active=p_active, updated_at=now()
     WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.social_admin_set_reward(uuid,int,text,numeric,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_admin_delete_reward(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM oculto_social_rewards WHERE id = p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.social_admin_delete_reward(uuid) TO authenticated;

-- ====== TRUST: TIPS ======

CREATE OR REPLACE FUNCTION public.trust_score_tips(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := coalesce(p_user, auth.uid());
  v_p   record;
  v_tips jsonb := '[]'::jsonb;
BEGIN
  SELECT name, avatar_url, bio, location_lat, is_verified,
         coalesce(document_verified,false) AS doc,
         coalesce(phone_verified,false) AS phone
    INTO v_p FROM profiles WHERE id = v_uid OR user_id = v_uid LIMIT 1;

  IF v_p IS NULL THEN RETURN v_tips; END IF;

  v_tips := v_tips || jsonb_build_object('key','avatar',  'label','Adicione uma foto real de perfil','points',10,'done', v_p.avatar_url IS NOT NULL);
  v_tips := v_tips || jsonb_build_object('key','bio',     'label','Escreva uma bio autêntica',         'points',5, 'done', length(coalesce(v_p.bio,'')) > 20);
  v_tips := v_tips || jsonb_build_object('key','location','label','Ative sua localização',             'points',5, 'done', v_p.location_lat IS NOT NULL);
  v_tips := v_tips || jsonb_build_object('key','verified','label','Selo de perfil verificado',         'points',20,'done', coalesce(v_p.is_verified,false));
  v_tips := v_tips || jsonb_build_object('key','document','label','Validar documento (KYC)',           'points',30,'done', v_p.doc);
  v_tips := v_tips || jsonb_build_object('key','phone',   'label','Confirmar telefone',                'points',10,'done', v_p.phone);
  v_tips := v_tips || jsonb_build_object('key','behavior','label','Manter boa reputação (sem denúncias válidas)','points',10,'done', true);

  RETURN v_tips;
END; $$;
GRANT EXECUTE ON FUNCTION public.trust_score_tips(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
