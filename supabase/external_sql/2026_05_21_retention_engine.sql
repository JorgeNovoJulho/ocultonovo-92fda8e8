-- =============================================================
-- RETENTION ENGINE — Sistema de Retenção Inicial Inteligente
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente. Não altera nada existente.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) TABELAS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.oculto_retention_progress (
  user_id uuid PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  retention_day integer NOT NULL DEFAULT 1,
  completed_missions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rewards_claimed jsonb NOT NULL DEFAULT '[]'::jsonb,
  abandon_card_dismissed_at timestamptz,
  comeback_hint_dismissed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oculto_retention_missions_config (
  key text PRIMARY KEY,
  title text NOT NULL,
  body text,
  cta_label text,
  cta_route text,
  icon text,
  hue integer NOT NULL DEFAULT 280,
  reward text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  min_day integer NOT NULL DEFAULT 1,
  max_day integer NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oculto_retention_alerts_config (
  key text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  emoji text DEFAULT '✨',
  hour_start integer NOT NULL DEFAULT 0,
  hour_end integer NOT NULL DEFAULT 23,
  max_per_day integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oculto_retention_alerts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retention_alerts_log_user_day
  ON public.oculto_retention_alerts_log (user_id, alert_key, sent_at DESC);

CREATE TABLE IF NOT EXISTS public.oculto_social_cycles_config (
  key text PRIMARY KEY,
  label text NOT NULL,
  emoji text DEFAULT '✨',
  hour_start integer NOT NULL,
  hour_end integer NOT NULL,
  intensity text NOT NULL DEFAULT 'medium' CHECK (intensity IN ('low','medium','high','rare')),
  hue integer NOT NULL DEFAULT 280,
  message text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.oculto_founder_progress (
  user_id uuid PRIMARY KEY,
  points integer NOT NULL DEFAULT 0,
  tier integer NOT NULL DEFAULT 0,
  perks_unlocked jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 2) RLS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.oculto_retention_progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_retention_missions_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_retention_alerts_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_retention_alerts_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_social_cycles_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_founder_progress          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retention_progress_self_rw ON public.oculto_retention_progress;
CREATE POLICY retention_progress_self_rw ON public.oculto_retention_progress
  FOR ALL USING (user_id = auth.uid() OR public.is_admin_master())
  WITH CHECK (user_id = auth.uid() OR public.is_admin_master());

DROP POLICY IF EXISTS retention_missions_read ON public.oculto_retention_missions_config;
CREATE POLICY retention_missions_read ON public.oculto_retention_missions_config
  FOR SELECT USING (true);
DROP POLICY IF EXISTS retention_missions_master ON public.oculto_retention_missions_config;
CREATE POLICY retention_missions_master ON public.oculto_retention_missions_config
  FOR ALL USING (public.is_admin_master()) WITH CHECK (public.is_admin_master());

DROP POLICY IF EXISTS retention_alerts_read ON public.oculto_retention_alerts_config;
CREATE POLICY retention_alerts_read ON public.oculto_retention_alerts_config
  FOR SELECT USING (true);
DROP POLICY IF EXISTS retention_alerts_master ON public.oculto_retention_alerts_config;
CREATE POLICY retention_alerts_master ON public.oculto_retention_alerts_config
  FOR ALL USING (public.is_admin_master()) WITH CHECK (public.is_admin_master());

DROP POLICY IF EXISTS retention_alerts_log_self ON public.oculto_retention_alerts_log;
CREATE POLICY retention_alerts_log_self ON public.oculto_retention_alerts_log
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin_master());

DROP POLICY IF EXISTS social_cycles_read ON public.oculto_social_cycles_config;
CREATE POLICY social_cycles_read ON public.oculto_social_cycles_config
  FOR SELECT USING (true);
DROP POLICY IF EXISTS social_cycles_master ON public.oculto_social_cycles_config;
CREATE POLICY social_cycles_master ON public.oculto_social_cycles_config
  FOR ALL USING (public.is_admin_master()) WITH CHECK (public.is_admin_master());

DROP POLICY IF EXISTS founder_progress_self ON public.oculto_founder_progress;
CREATE POLICY founder_progress_self ON public.oculto_founder_progress
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin_master());
DROP POLICY IF EXISTS founder_progress_master_rw ON public.oculto_founder_progress;
CREATE POLICY founder_progress_master_rw ON public.oculto_founder_progress
  FOR ALL USING (public.is_admin_master()) WITH CHECK (public.is_admin_master());

-- ──────────────────────────────────────────────────────────────
-- 3) SEEDS
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.oculto_retention_missions_config
  (key, title, body, cta_label, cta_route, icon, hue, reward, sort_order, min_day, max_day) VALUES
  ('enter_room',     'Entre em uma sala',          'Sinta a energia ao vivo.',           'Ver salas',    '/aura-rooms', 'users',    280, 'glow_rare',   10, 1, 7),
  ('try_aura_match', 'Explore o Aura Match',       'Descubra afinidades sutis.',         'Aura Match',   '/aura-match', 'sparkles', 320, 'glow_rare',   20, 1, 7),
  ('check_radar',    'Veja quem está online',      'Pessoas conectadas perto de você.',  'Abrir radar',  '/radar',     'radar',    200, 'aura_temp',   30, 1, 7),
  ('send_pulse',     'Envie seu primeiro Pulso',   'Marque presença sem dizer nada.',    'Enviar pulso', '/pulses',    'zap',      45,  'pulse_extra', 40, 1, 7),
  ('view_5_profiles','Descubra 5 energias',        'Olhe 5 perfis hoje.',                'Explorar',     '/feed',      'eye',      260, 'glow_rare',   50, 1, 7)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.oculto_retention_alerts_config (key, title, body, emoji, hour_start, hour_end, max_per_day) VALUES
  ('gentle_24h_inactive', 'O universo sente sua falta', 'Algumas conexões surgiram desde que você saiu.', '💜', 9, 22, 1),
  ('room_hot_now',        'Uma sala entrou em ebulição', 'Pessoas se conectando agora.',                  '🔥', 19, 23, 1),
  ('cycle_night_kick',    'A noite está mais intensa',   'Mais pessoas online após as 22h.',              '🌙', 21, 23, 1),
  ('aura_received',       'Sua aura recebeu atenção',    'Alguém olhou seu perfil.',                      '✨', 8, 22, 2)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.oculto_social_cycles_config (key, label, emoji, hour_start, hour_end, intensity, hue, message, sort_order) VALUES
  ('morning',  'Manhã leve',        '🌅', 6, 11, 'low',    45,  'Energia suave. Bom para explorar.',           10),
  ('midday',   'Tarde social',      '☀️', 12, 17, 'medium', 200, 'Salas começando a aquecer.',                  20),
  ('night',    'Noite intensa',     '🌙', 18, 23, 'high',   280, 'Mais conexões acontecendo agora.',            30),
  ('latenight','Madrugada rara',    '🔮', 0, 5, 'rare',     320, 'Conexões raras emergem nesse horário.',       40)
ON CONFLICT (key) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 4) RPCs (plpgsql + SET search_path para evitar inlining/RLS)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.retention_touch()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.oculto_retention_progress (user_id, last_active_at, retention_day, updated_at)
  VALUES (v_uid, now(), 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_active_at = now(),
        retention_day = LEAST(7, GREATEST(public.oculto_retention_progress.retention_day,
          CEIL(EXTRACT(EPOCH FROM (now() - public.oculto_retention_progress.first_seen_at)) / 86400.0)::int)),
        updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.retention_touch() TO authenticated;

CREATE OR REPLACE FUNCTION public.retention_state_get()
RETURNS TABLE (
  retention_day int,
  first_seen_at timestamptz,
  last_active_at timestamptz,
  hours_since_active numeric,
  completed_missions jsonb,
  abandon_card_dismissed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.retention_day, p.first_seen_at, p.last_active_at,
         EXTRACT(EPOCH FROM (now() - p.last_active_at))/3600.0,
         p.completed_missions, p.abandon_card_dismissed_at
  FROM public.oculto_retention_progress p WHERE p.user_id = v_uid;
END $$;
GRANT EXECUTE ON FUNCTION public.retention_state_get() TO authenticated;

CREATE OR REPLACE FUNCTION public.retention_missions_for_me()
RETURNS TABLE (
  key text, title text, body text, cta_label text, cta_route text,
  icon text, hue int, reward text, sort_order int, completed boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day int := 1;
  v_done jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT p.retention_day, p.completed_missions INTO v_day, v_done
    FROM public.oculto_retention_progress p WHERE p.user_id = v_uid;
    v_day := COALESCE(v_day, 1);
    v_done := COALESCE(v_done, '[]'::jsonb);
  END IF;
  RETURN QUERY
  SELECT m.key, m.title, m.body, m.cta_label, m.cta_route, m.icon, m.hue, m.reward, m.sort_order,
         (v_done ? m.key) AS completed
  FROM public.oculto_retention_missions_config m
  WHERE m.active = true AND v_day BETWEEN m.min_day AND m.max_day
  ORDER BY (v_done ? m.key) ASC, m.sort_order ASC;
END $$;
GRANT EXECUTE ON FUNCTION public.retention_missions_for_me() TO authenticated;

CREATE OR REPLACE FUNCTION public.retention_mission_complete(p_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing jsonb;
  v_reward text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  SELECT reward INTO v_reward FROM public.oculto_retention_missions_config WHERE key = p_key AND active = true;
  IF v_reward IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found'); END IF;

  INSERT INTO public.oculto_retention_progress (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT completed_missions INTO v_existing FROM public.oculto_retention_progress WHERE user_id = v_uid;
  IF v_existing ? p_key THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  UPDATE public.oculto_retention_progress
    SET completed_missions = COALESCE(v_existing,'[]'::jsonb) || to_jsonb(p_key),
        last_active_at = now(),
        updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'reward', v_reward);
END $$;
GRANT EXECUTE ON FUNCTION public.retention_mission_complete(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.retention_dismiss_abandon_card()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.oculto_retention_progress (user_id, abandon_card_dismissed_at)
  VALUES (v_uid, now())
  ON CONFLICT (user_id) DO UPDATE SET abandon_card_dismissed_at = now(), updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.retention_dismiss_abandon_card() TO authenticated;

CREATE OR REPLACE FUNCTION public.social_cycle_current()
RETURNS TABLE (key text, label text, emoji text, intensity text, hue int, message text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h int := EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Sao_Paulo')::int;
BEGIN
  RETURN QUERY
  SELECT c.key, c.label, c.emoji, c.intensity, c.hue, c.message
  FROM public.oculto_social_cycles_config c
  WHERE c.active = true
    AND ((c.hour_start <= c.hour_end AND v_h BETWEEN c.hour_start AND c.hour_end)
      OR (c.hour_start > c.hour_end AND (v_h >= c.hour_start OR v_h <= c.hour_end)))
  ORDER BY c.sort_order LIMIT 1;
END $$;
GRANT EXECUTE ON FUNCTION public.social_cycle_current() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.retention_alert_can_send(p_user_id uuid, p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.oculto_retention_alerts_config%ROWTYPE;
  v_h int := EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Sao_Paulo')::int;
  v_sent int;
BEGIN
  SELECT * INTO v_cfg FROM public.oculto_retention_alerts_config WHERE key = p_key AND active = true;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_h < v_cfg.hour_start OR v_h > v_cfg.hour_end THEN RETURN false; END IF;
  SELECT COUNT(*) INTO v_sent FROM public.oculto_retention_alerts_log
    WHERE user_id = p_user_id AND alert_key = p_key AND sent_at > (now() - interval '1 day');
  RETURN v_sent < v_cfg.max_per_day;
END $$;
GRANT EXECUTE ON FUNCTION public.retention_alert_can_send(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.founder_progress_get()
RETURNS TABLE (points int, tier int, perks_unlocked jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT COALESCE(f.points,0), COALESCE(f.tier,0), COALESCE(f.perks_unlocked,'[]'::jsonb)
  FROM (SELECT 1) one
  LEFT JOIN public.oculto_founder_progress f ON f.user_id = v_uid;
END $$;
GRANT EXECUTE ON FUNCTION public.founder_progress_get() TO authenticated;

CREATE OR REPLACE FUNCTION public.founder_progress_award(p_points int, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_points int;
  v_tier int;
BEGIN
  IF v_uid IS NULL OR p_points IS NULL OR p_points <= 0 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  INSERT INTO public.oculto_founder_progress (user_id, points) VALUES (v_uid, p_points)
  ON CONFLICT (user_id) DO UPDATE SET points = public.oculto_founder_progress.points + p_points,
                                       updated_at = now()
  RETURNING points INTO v_new_points;
  v_tier := LEAST(5, v_new_points / 100);
  UPDATE public.oculto_founder_progress SET tier = v_tier WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true, 'points', v_new_points, 'tier', v_tier);
END $$;
GRANT EXECUTE ON FUNCTION public.founder_progress_award(int, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
