-- =====================================================================
-- Universo Social Ao Vivo — extensão de oculto_aura_rooms
-- Idempotente. Reúsa schema existente. Não quebra Aura/Prestígio.
-- Cole no SQL Editor do Supabase externo.
-- =====================================================================

-- 1) Estende oculto_aura_rooms ----------------------------------------
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS min_aura_level     smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_social_score   integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_prestige_xp    integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_plan      text,                    -- null|premium|vip
  ADD COLUMN IF NOT EXISTS requires_kyc       boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS couple_only        boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order         smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS glow_intensity     smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS description        text;

-- Seed das 7 salas (mantém as 3 atuais via ON CONFLICT) ---------------
INSERT INTO public.oculto_aura_rooms
  (slug, name, theme, hue, emoji, vip_only, hour_from, hour_to, min_aura_level, min_social_score, min_prestige_xp, required_plan, sort_order, glow_intensity, description)
VALUES
  ('lounge-solteiros',   'Lounge Solteiros',   'Descobertas e flertes',           285, '💜', false, NULL, NULL, 0,    0, 0,    NULL,      10, 60, 'Para quem está conhecendo gente nova.'),
  ('casais-em-sintonia', 'Casais em Sintonia', 'Energia entre casais',            350, '🔥', false, NULL, NULL, 0,    0, 0,    NULL,      20, 70, 'Casais que vibram juntos.'),
  ('energia-livre',      'Energia Livre',      'Ambiente intenso e aberto',         5, '⚡', false, NULL, NULL, 1,  100, 0,    NULL,      30, 75, 'Aura aberta, energia alta.'),
  ('conexoes-secretas',  'Conexões Secretas',  'Encontros discretos e curiosos',  320, '💜', false, NULL, NULL, 0,    0, 0,    NULL,      40, 65, 'Discrição e curiosidade.'),
  ('after-oculto',       'After Oculto',       'Madrugada social',                260, '🌙', false, 0,    5,    0,    0, 0,    NULL,      50, 80, 'Só desperta após meia-noite.'),
  ('influencia-vip',     'Influência VIP',     'Prestígio elevado',                45, '👑', true,  NULL, NULL, 2,  500, 0,    'vip',     60, 85, 'Apenas VIPs brilham aqui.'),
  ('aura-elite',         'Aura Elite',         'Apenas auras lendárias',          290, '💎', false, NULL, NULL, 4, 2000, 5000, NULL,      70, 95, 'Reservado a auras lendárias.')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  theme = EXCLUDED.theme,
  hue = EXCLUDED.hue,
  emoji = EXCLUDED.emoji,
  description = EXCLUDED.description,
  glow_intensity = EXCLUDED.glow_intensity,
  sort_order = EXCLUDED.sort_order;

-- 2) Tabela de presença efêmera ---------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_aura_room_presence (
  room_slug   text NOT NULL REFERENCES public.oculto_aura_rooms(slug) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  entered_at  timestamptz NOT NULL DEFAULT now(),
  last_ping   timestamptz NOT NULL DEFAULT now(),
  is_observer boolean NOT NULL DEFAULT false,
  PRIMARY KEY (room_slug, user_id)
);
CREATE INDEX IF NOT EXISTS idx_oculto_aura_room_presence_active
  ON public.oculto_aura_room_presence (room_slug, last_ping DESC);

ALTER TABLE public.oculto_aura_room_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presence_read"  ON public.oculto_aura_room_presence;
DROP POLICY IF EXISTS "presence_write" ON public.oculto_aura_room_presence;
DROP POLICY IF EXISTS "presence_del"   ON public.oculto_aura_room_presence;
CREATE POLICY "presence_read"  ON public.oculto_aura_room_presence FOR SELECT TO authenticated USING (true);
CREATE POLICY "presence_write" ON public.oculto_aura_room_presence FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "presence_upd"   ON public.oculto_aura_room_presence FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "presence_del"   ON public.oculto_aura_room_presence FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3) Tabela de reações efêmeras ---------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_aura_room_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug   text NOT NULL REFERENCES public.oculto_aura_rooms(slug) ON DELETE CASCADE,
  from_user   uuid NOT NULL,
  to_user     uuid,
  kind        text NOT NULL CHECK (kind IN ('energy','observe','approach','highlight')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oculto_aura_room_reactions_recent
  ON public.oculto_aura_room_reactions (room_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_aura_room_reactions_to
  ON public.oculto_aura_room_reactions (to_user, created_at DESC) WHERE to_user IS NOT NULL;

ALTER TABLE public.oculto_aura_room_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reactions_read"  ON public.oculto_aura_room_reactions;
DROP POLICY IF EXISTS "reactions_write" ON public.oculto_aura_room_reactions;
CREATE POLICY "reactions_read"  ON public.oculto_aura_room_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "reactions_write" ON public.oculto_aura_room_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user);

-- 4) Helpers de gating ------------------------------------------------
CREATE OR REPLACE FUNCTION public._aura_room_check_gates(p_slug text, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.oculto_aura_rooms;
  v_plan text;
  v_kyc  boolean;
  v_couple boolean;
  v_aura_lvl smallint := 0;
  v_score int := 0;
  v_xp int := 0;
  v_reason text := NULL;
BEGIN
  SELECT * INTO r FROM public.oculto_aura_rooms WHERE slug = p_slug AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false, 'observer', false, 'reason', 'room_not_found'); END IF;

  SELECT lower(coalesce(plan_type,'free')),
         coalesce(document_verified,false),
         (lower(coalesce(profile_type,'')) IN ('couple','casal'))
    INTO v_plan, v_kyc, v_couple
    FROM public.profiles WHERE user_id = p_user;

  -- Score / XP / Level (com fallback se tabelas não existirem)
  BEGIN
    SELECT coalesce(total_score,0), coalesce(total_xp,0)
      INTO v_score, v_xp
      FROM public.oculto_social_scores WHERE user_id = p_user;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    SELECT coalesce(level,0) INTO v_aura_lvl FROM public.aura_progress WHERE user_id = p_user;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  IF r.required_plan = 'vip'     AND v_plan NOT LIKE '%vip%'    THEN v_reason := 'plan_vip_required'; END IF;
  IF r.required_plan = 'premium' AND v_plan = 'free'            THEN v_reason := 'plan_premium_required'; END IF;
  IF r.requires_kyc AND NOT v_kyc                                THEN v_reason := 'kyc_required'; END IF;
  IF r.couple_only AND NOT v_couple                              THEN v_reason := 'couple_only'; END IF;
  IF v_aura_lvl < r.min_aura_level                               THEN v_reason := 'aura_level_low'; END IF;
  IF v_score    < r.min_social_score                             THEN v_reason := 'social_score_low'; END IF;
  IF v_xp       < r.min_prestige_xp                              THEN v_reason := 'prestige_low'; END IF;

  RETURN jsonb_build_object(
    'allowed',  v_reason IS NULL,
    'observer', v_reason IS NOT NULL,
    'reason',   v_reason
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public._aura_room_check_gates(text, uuid) TO authenticated;

-- 5) JOIN / PING / LEAVE ----------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_room_join(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_check jsonb;
  v_obs boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason','no_auth'); END IF;
  v_check := public._aura_room_check_gates(p_slug, v_uid);
  v_obs := NOT (v_check->>'allowed')::boolean;

  INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
  VALUES (p_slug, v_uid, v_obs, now())
  ON CONFLICT (room_slug, user_id) DO UPDATE
    SET last_ping = now(), is_observer = EXCLUDED.is_observer;

  RETURN v_check;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_join(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_room_ping(p_slug text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.oculto_aura_room_presence
     SET last_ping = now()
   WHERE room_slug = p_slug AND user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_ping(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_room_leave(p_slug text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.oculto_aura_room_presence
   WHERE room_slug = p_slug AND user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_leave(text) TO authenticated;

-- 6) Reações com rate limit leve --------------------------------------
CREATE OR REPLACE FUNCTION public.aura_room_react(p_slug text, p_kind text, p_to uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_recent int;
  v_to_recent int;
  v_obs boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason','no_auth'); END IF;
  IF p_kind NOT IN ('energy','observe','approach','highlight') THEN
    RETURN jsonb_build_object('ok', false, 'reason','bad_kind');
  END IF;

  -- bloqueia observador
  SELECT is_observer INTO v_obs FROM public.oculto_aura_room_presence
   WHERE room_slug = p_slug AND user_id = v_uid;
  IF v_obs IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason','observer_only');
  END IF;

  -- rate-limit: 1 reação a cada 3s por user/sala
  SELECT count(*) INTO v_recent
    FROM public.oculto_aura_room_reactions
   WHERE room_slug = p_slug AND from_user = v_uid AND created_at > now() - interval '3 seconds';
  IF v_recent > 0 THEN RETURN jsonb_build_object('ok', false, 'reason','rate_limited'); END IF;

  -- rate-limit: 3 reações por minuto ao mesmo alvo
  IF p_to IS NOT NULL THEN
    SELECT count(*) INTO v_to_recent
      FROM public.oculto_aura_room_reactions
     WHERE from_user = v_uid AND to_user = p_to AND created_at > now() - interval '1 minute';
    IF v_to_recent >= 3 THEN RETURN jsonb_build_object('ok', false, 'reason','target_rate_limited'); END IF;
  END IF;

  INSERT INTO public.oculto_aura_room_reactions(room_slug, from_user, to_user, kind)
  VALUES (p_slug, v_uid, p_to, p_kind);

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_react(text, text, uuid) TO authenticated;

-- 7) STATE: presença + energia + dominante ----------------------------
CREATE OR REPLACE FUNCTION public.aura_room_state(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room   public.oculto_aura_rooms;
  v_hour   int := EXTRACT(HOUR FROM now() at time zone 'America/Sao_Paulo')::int;
  v_within boolean := true;
  v_presents jsonb;
  v_dominant uuid;
  v_n_pres int;
  v_n_react int;
  v_energy int;
BEGIN
  SELECT * INTO v_room FROM public.oculto_aura_rooms WHERE slug = p_slug AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('exists', false); END IF;

  IF v_room.hour_from IS NOT NULL AND v_room.hour_to IS NOT NULL THEN
    IF v_room.hour_from < v_room.hour_to THEN
      v_within := v_hour >= v_room.hour_from AND v_hour < v_room.hour_to;
    ELSE
      v_within := v_hour >= v_room.hour_from OR v_hour < v_room.hour_to;
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', p.user_id,
    'name', p.name,
    'avatar_url', p.avatar_url,
    'plan_type', p.plan_type,
    'is_observer', pr.is_observer,
    'entered_at', pr.entered_at
  ) ORDER BY pr.entered_at DESC), '[]'::jsonb), count(*)
    INTO v_presents, v_n_pres
    FROM public.oculto_aura_room_presence pr
    JOIN public.profiles p ON p.user_id = pr.user_id
   WHERE pr.room_slug = p_slug
     AND pr.last_ping > now() - interval '3 minutes'
     AND coalesce(p.is_invisible,false) = false
     AND coalesce(p.is_seed,false) = false;

  SELECT count(*) INTO v_n_react
    FROM public.oculto_aura_room_reactions
   WHERE room_slug = p_slug AND created_at > now() - interval '60 seconds';

  -- Dominante: usuário mais alvo de reações últimos 5 min
  SELECT to_user INTO v_dominant
    FROM public.oculto_aura_room_reactions
   WHERE room_slug = p_slug AND created_at > now() - interval '5 minutes' AND to_user IS NOT NULL
   GROUP BY to_user ORDER BY count(*) DESC LIMIT 1;

  v_energy := LEAST(100, (v_n_pres * 6) + (v_n_react * 4) + v_room.glow_intensity / 4);

  RETURN jsonb_build_object(
    'exists', true,
    'within_window', v_within,
    'presents', v_presents,
    'count', v_n_pres,
    'reactions_60s', v_n_react,
    'dominant_user_id', v_dominant,
    'energy', v_energy,
    'hue', v_room.hue,
    'glow_intensity', v_room.glow_intensity
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_state(text) TO authenticated;

-- 8) Lista pública de salas (com gates do user atual) -----------------
CREATE OR REPLACE FUNCTION public.aura_rooms_list()
RETURNS TABLE(
  slug text, name text, emoji text, hue smallint, description text,
  vip_only boolean, required_plan text, requires_kyc boolean, couple_only boolean,
  min_aura_level smallint, min_social_score int, min_prestige_xp int,
  hour_from smallint, hour_to smallint, glow_intensity smallint, sort_order smallint,
  active_count int, allowed boolean, observer_only boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT r.slug, r.name, r.emoji, r.hue, r.description,
         r.vip_only, r.required_plan, r.requires_kyc, r.couple_only,
         r.min_aura_level, r.min_social_score, r.min_prestige_xp,
         r.hour_from, r.hour_to, r.glow_intensity, r.sort_order,
         (SELECT count(*)::int FROM public.oculto_aura_room_presence pr
            WHERE pr.room_slug = r.slug AND pr.last_ping > now() - interval '3 minutes') AS active_count,
         COALESCE((public._aura_room_check_gates(r.slug, v_uid)->>'allowed')::boolean, false) AS allowed,
         COALESCE((public._aura_room_check_gates(r.slug, v_uid)->>'observer')::boolean, true)  AS observer_only
    FROM public.oculto_aura_rooms r
   WHERE r.active = true
   ORDER BY r.sort_order ASC, r.name ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_list() TO authenticated;

-- 9) Purge automática (chamar via cron externo se desejar) ------------
CREATE OR REPLACE FUNCTION public.aura_rooms_purge()
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.oculto_aura_room_presence  WHERE last_ping  < now() - interval '5 minutes';
  DELETE FROM public.oculto_aura_room_reactions WHERE created_at < now() - interval '10 minutes';
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_purge() TO authenticated;
-- pg_cron (opcional): SELECT cron.schedule('aura_rooms_purge','*/2 * * * *', $$SELECT public.aura_rooms_purge();$$);

-- 10) Realtime --------------------------------------------------------
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname='public' AND tablename='oculto_aura_room_presence';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_presence';
  END IF;
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname='public' AND tablename='oculto_aura_room_reactions';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_reactions';
  END IF;
END $$;

-- 11) Admin upsert RPC (apenas master admin) --------------------------
CREATE OR REPLACE FUNCTION public.aura_room_upsert(p_payload jsonb)
RETURNS public.oculto_aura_rooms
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.oculto_aura_rooms;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND lower(coalesce(username,'')) = 'ocultomaster') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.oculto_aura_rooms (
    slug, name, theme, hue, emoji, active, vip_only,
    hour_from, hour_to, min_aura_level, min_social_score, min_prestige_xp,
    required_plan, requires_kyc, couple_only, sort_order, glow_intensity, description
  ) VALUES (
    p_payload->>'slug',
    coalesce(p_payload->>'name', p_payload->>'slug'),
    p_payload->>'theme',
    coalesce((p_payload->>'hue')::smallint, 280),
    p_payload->>'emoji',
    coalesce((p_payload->>'active')::boolean, true),
    coalesce((p_payload->>'vip_only')::boolean, false),
    nullif(p_payload->>'hour_from','')::smallint,
    nullif(p_payload->>'hour_to','')::smallint,
    coalesce((p_payload->>'min_aura_level')::smallint, 0),
    coalesce((p_payload->>'min_social_score')::int, 0),
    coalesce((p_payload->>'min_prestige_xp')::int, 0),
    nullif(p_payload->>'required_plan',''),
    coalesce((p_payload->>'requires_kyc')::boolean, false),
    coalesce((p_payload->>'couple_only')::boolean, false),
    coalesce((p_payload->>'sort_order')::smallint, 0),
    coalesce((p_payload->>'glow_intensity')::smallint, 50),
    p_payload->>'description'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, theme = EXCLUDED.theme, hue = EXCLUDED.hue, emoji = EXCLUDED.emoji,
    active = EXCLUDED.active, vip_only = EXCLUDED.vip_only,
    hour_from = EXCLUDED.hour_from, hour_to = EXCLUDED.hour_to,
    min_aura_level = EXCLUDED.min_aura_level,
    min_social_score = EXCLUDED.min_social_score,
    min_prestige_xp = EXCLUDED.min_prestige_xp,
    required_plan = EXCLUDED.required_plan,
    requires_kyc = EXCLUDED.requires_kyc,
    couple_only = EXCLUDED.couple_only,
    sort_order = EXCLUDED.sort_order,
    glow_intensity = EXCLUDED.glow_intensity,
    description = EXCLUDED.description
  RETURNING * INTO r;

  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_upsert(jsonb) TO authenticated;

-- 12) Refatora aura_room_presence para usar presença efêmera ----------
CREATE OR REPLACE FUNCTION public.aura_room_presence(p_slug text)
RETURNS TABLE(user_id uuid, name text, avatar_url text, plan_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.name, p.avatar_url, p.plan_type
    FROM public.oculto_aura_room_presence pr
    JOIN public.profiles p ON p.user_id = pr.user_id
   WHERE pr.room_slug = p_slug
     AND pr.last_ping > now() - interval '3 minutes'
     AND coalesce(p.is_invisible,false) = false
     AND coalesce(p.is_seed,false) = false
   ORDER BY pr.entered_at DESC
   LIMIT 24;
$$;

NOTIFY pgrst, 'reload schema';
