-- =====================================================================
-- ONDA C — Universo Social Vivo
-- Tabelas + RPCs idempotentes para:
--   1. Noites Ocultas (eventos sociais temporários)
--   2. Temporadas Sociais (ciclos globais + ranking)
--   3. Destino Social (afinidades raras / encontros recorrentes)
--   4. Energia Magnética (boost elegante 30-60 min)
--   5. Pass VIP Social (entitlements premium)
--   6. Conexões Ocultas (descobertas raras limitadas)
--   7. Experiências Reais (eventos locais com LGPD/consent)
--   8. Feed Vivo (eventos do universo no feed)
--
-- Tudo em SECURITY DEFINER + SET search_path=public.
-- Performance-first: índices enxutos, sem realtime extra.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NOITES OCULTAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_noites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('madrugada_secreta','eclipse_social','tempestade_aura','noite_vip')),
  title text NOT NULL,
  subtitle text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  hue smallint NOT NULL DEFAULT 280,
  emoji text DEFAULT '🌙',
  vip_only boolean NOT NULL DEFAULT false,
  intensity smallint NOT NULL DEFAULT 2 CHECK (intensity BETWEEN 1 AND 3),
  effects jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oculto_noites_active ON public.oculto_noites (ends_at DESC);
ALTER TABLE public.oculto_noites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "noites read active" ON public.oculto_noites;
CREATE POLICY "noites read active" ON public.oculto_noites
  FOR SELECT TO authenticated USING (ends_at > now());

CREATE OR REPLACE FUNCTION public.noite_oculta_current()
RETURNS TABLE(id uuid, kind text, title text, subtitle text,
              starts_at timestamptz, ends_at timestamptz,
              hue smallint, emoji text, vip_only boolean,
              intensity smallint, effects jsonb,
              remaining_seconds integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.kind, n.title, n.subtitle, n.starts_at, n.ends_at,
         n.hue, n.emoji, n.vip_only, n.intensity, n.effects,
         GREATEST(0, EXTRACT(EPOCH FROM (n.ends_at - now()))::int)
  FROM public.oculto_noites n
  WHERE n.ends_at > now() AND n.starts_at <= now()
  ORDER BY n.starts_at DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.noite_oculta_current() TO authenticated;

CREATE OR REPLACE FUNCTION public.noite_oculta_trigger(
  p_kind text, p_title text, p_minutes int DEFAULT 60,
  p_subtitle text DEFAULT NULL, p_vip_only boolean DEFAULT false,
  p_intensity int DEFAULT 2, p_emoji text DEFAULT '🌙', p_hue int DEFAULT 280
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.oculto_noites(kind, title, subtitle, ends_at, vip_only, intensity, emoji, hue)
  VALUES (p_kind, p_title, p_subtitle,
          now() + make_interval(mins => GREATEST(5, p_minutes)),
          p_vip_only, GREATEST(1, LEAST(3, p_intensity)),
          COALESCE(p_emoji,'🌙'), GREATEST(0, LEAST(360, p_hue)))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.noite_oculta_trigger(text,text,int,text,boolean,int,text,int) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. TEMPORADAS SOCIAIS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  narrative text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  theme_hue smallint NOT NULL DEFAULT 280,
  emoji text DEFAULT '🌌',
  rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oculto_seasons_window ON public.oculto_seasons (starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.oculto_season_progress (
  season_id uuid NOT NULL REFERENCES public.oculto_seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  rank integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_season_progress_xp ON public.oculto_season_progress (season_id, xp DESC);

ALTER TABLE public.oculto_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_season_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seasons read all" ON public.oculto_seasons;
CREATE POLICY "seasons read all" ON public.oculto_seasons
  FOR SELECT TO authenticated USING (active = true);
DROP POLICY IF EXISTS "season progress read self" ON public.oculto_season_progress;
CREATE POLICY "season progress read self" ON public.oculto_season_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.season_current()
RETURNS TABLE(id uuid, code text, title text, narrative text,
              starts_at timestamptz, ends_at timestamptz,
              theme_hue smallint, emoji text, rewards jsonb,
              remaining_seconds integer, total_seconds integer,
              progress_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.code, s.title, s.narrative, s.starts_at, s.ends_at,
         s.theme_hue, s.emoji, s.rewards,
         GREATEST(0, EXTRACT(EPOCH FROM (s.ends_at - now()))::int) AS remaining_seconds,
         GREATEST(1, EXTRACT(EPOCH FROM (s.ends_at - s.starts_at))::int) AS total_seconds,
         ROUND(LEAST(100, GREATEST(0,
           EXTRACT(EPOCH FROM (now() - s.starts_at)) /
           NULLIF(EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)), 0) * 100
         ))::numeric, 2) AS progress_pct
  FROM public.oculto_seasons s
  WHERE s.active AND s.starts_at <= now() AND s.ends_at > now()
  ORDER BY s.starts_at DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.season_current() TO authenticated;

CREATE OR REPLACE FUNCTION public.season_get_my_progress()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_season uuid; v_xp int; v_rank int; v_total int;
BEGIN
  SELECT id INTO v_season FROM public.oculto_seasons
   WHERE active AND starts_at <= now() AND ends_at > now()
   ORDER BY starts_at DESC LIMIT 1;
  IF v_season IS NULL THEN RETURN jsonb_build_object('season', null); END IF;
  SELECT xp INTO v_xp FROM public.oculto_season_progress
   WHERE season_id = v_season AND user_id = auth.uid();
  SELECT count(*) INTO v_total FROM public.oculto_season_progress WHERE season_id = v_season;
  IF v_xp IS NOT NULL THEN
    SELECT 1 + count(*) INTO v_rank FROM public.oculto_season_progress
     WHERE season_id = v_season AND xp > COALESCE(v_xp,0);
  END IF;
  RETURN jsonb_build_object(
    'season_id', v_season,
    'xp', COALESCE(v_xp,0),
    'rank', v_rank,
    'total_players', v_total
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.season_get_my_progress() TO authenticated;

CREATE OR REPLACE FUNCTION public.season_top(p_limit int DEFAULT 20)
RETURNS TABLE(rank int, user_id uuid, xp int, username text, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT id FROM public.oculto_seasons
     WHERE active AND starts_at <= now() AND ends_at > now()
     ORDER BY starts_at DESC LIMIT 1
  )
  SELECT (ROW_NUMBER() OVER (ORDER BY p.xp DESC))::int AS rank,
         p.user_id, p.xp,
         pr.username, pr.display_name, pr.avatar_url
  FROM public.oculto_season_progress p
  JOIN s ON s.id = p.season_id
  LEFT JOIN public.profiles pr ON pr.id = p.user_id OR pr.user_id = p.user_id
  ORDER BY p.xp DESC
  LIMIT GREATEST(1, LEAST(100, p_limit));
$$;
GRANT EXECUTE ON FUNCTION public.season_top(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.season_award_xp(p_user uuid, p_xp int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_season uuid;
BEGIN
  SELECT id INTO v_season FROM public.oculto_seasons
   WHERE active AND starts_at <= now() AND ends_at > now()
   ORDER BY starts_at DESC LIMIT 1;
  IF v_season IS NULL OR p_user IS NULL OR p_xp IS NULL OR p_xp = 0 THEN RETURN; END IF;
  INSERT INTO public.oculto_season_progress(season_id, user_id, xp, updated_at)
  VALUES (v_season, p_user, GREATEST(0, p_xp), now())
  ON CONFLICT (season_id, user_id)
    DO UPDATE SET xp = public.oculto_season_progress.xp + GREATEST(0, p_xp),
                  updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.season_award_xp(uuid,int) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. DESTINO SOCIAL — afinidades raras / encontros recorrentes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_destiny_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  affinity smallint NOT NULL DEFAULT 50 CHECK (affinity BETWEEN 0 AND 100),
  encounters integer NOT NULL DEFAULT 1,
  rarity text NOT NULL DEFAULT 'common'
    CHECK (rarity IN ('common','uncommon','rare','epic','mythic')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT destiny_pair UNIQUE (user_a, user_b),
  CHECK (user_a <> user_b)
);
CREATE INDEX IF NOT EXISTS idx_destiny_user_a ON public.oculto_destiny_links (user_a, affinity DESC);
CREATE INDEX IF NOT EXISTS idx_destiny_user_b ON public.oculto_destiny_links (user_b, affinity DESC);

ALTER TABLE public.oculto_destiny_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "destiny read mine" ON public.oculto_destiny_links;
CREATE POLICY "destiny read mine" ON public.oculto_destiny_links
  FOR SELECT TO authenticated
  USING (user_a = auth.uid() OR user_b = auth.uid());

CREATE OR REPLACE FUNCTION public.destiny_register_encounter(p_other uuid, p_affinity_delta int DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a uuid; v_b uuid; v_aff int;
BEGIN
  IF auth.uid() IS NULL OR p_other IS NULL OR auth.uid() = p_other THEN RETURN; END IF;
  v_a := LEAST(auth.uid(), p_other);
  v_b := GREATEST(auth.uid(), p_other);
  INSERT INTO public.oculto_destiny_links(user_a, user_b, affinity, encounters, last_seen_at)
  VALUES (v_a, v_b, GREATEST(0, LEAST(100, 50 + p_affinity_delta)), 1, now())
  ON CONFLICT (user_a, user_b) DO UPDATE SET
    affinity = GREATEST(0, LEAST(100, public.oculto_destiny_links.affinity + p_affinity_delta)),
    encounters = public.oculto_destiny_links.encounters + 1,
    last_seen_at = now(),
    rarity = CASE
      WHEN public.oculto_destiny_links.encounters + 1 >= 25 AND public.oculto_destiny_links.affinity + p_affinity_delta >= 90 THEN 'mythic'
      WHEN public.oculto_destiny_links.encounters + 1 >= 15 AND public.oculto_destiny_links.affinity + p_affinity_delta >= 80 THEN 'epic'
      WHEN public.oculto_destiny_links.encounters + 1 >= 8  AND public.oculto_destiny_links.affinity + p_affinity_delta >= 70 THEN 'rare'
      WHEN public.oculto_destiny_links.encounters + 1 >= 3  AND public.oculto_destiny_links.affinity + p_affinity_delta >= 60 THEN 'uncommon'
      ELSE 'common'
    END;
END; $$;
GRANT EXECUTE ON FUNCTION public.destiny_register_encounter(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.destiny_my_top(p_limit int DEFAULT 10)
RETURNS TABLE(other_user uuid, affinity smallint, encounters int, rarity text,
              last_seen_at timestamptz, username text, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE WHEN d.user_a = auth.uid() THEN d.user_b ELSE d.user_a END AS other_user,
    d.affinity, d.encounters, d.rarity, d.last_seen_at,
    pr.username, pr.display_name, pr.avatar_url
  FROM public.oculto_destiny_links d
  LEFT JOIN public.profiles pr ON pr.id = (CASE WHEN d.user_a = auth.uid() THEN d.user_b ELSE d.user_a END)
                                OR pr.user_id = (CASE WHEN d.user_a = auth.uid() THEN d.user_b ELSE d.user_a END)
  WHERE d.user_a = auth.uid() OR d.user_b = auth.uid()
  ORDER BY d.affinity DESC, d.encounters DESC
  LIMIT GREATEST(1, LEAST(50, p_limit));
$$;
GRANT EXECUTE ON FUNCTION public.destiny_my_top(int) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. ENERGIA MAGNÉTICA (boost elegante)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_magnetic_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  multiplier numeric(3,2) NOT NULL DEFAULT 1.50 CHECK (multiplier BETWEEN 1.00 AND 3.00),
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_magnetic_user_active ON public.oculto_magnetic_boosts (user_id, ends_at DESC);

ALTER TABLE public.oculto_magnetic_boosts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "magnetic read self" ON public.oculto_magnetic_boosts;
CREATE POLICY "magnetic read self" ON public.oculto_magnetic_boosts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.magnetic_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.oculto_magnetic_boosts
   WHERE user_id = auth.uid() AND ends_at > now()
   ORDER BY ends_at DESC LIMIT 1;
  IF v_row IS NULL THEN
    RETURN jsonb_build_object('active', false);
  END IF;
  RETURN jsonb_build_object(
    'active', true,
    'multiplier', v_row.multiplier,
    'ends_at', v_row.ends_at,
    'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (v_row.ends_at - now()))::int),
    'source', v_row.source
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.magnetic_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.magnetic_activate(p_minutes int DEFAULT 30, p_multiplier numeric DEFAULT 1.5, p_source text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('error','no_user'); END IF;
  INSERT INTO public.oculto_magnetic_boosts(user_id, ends_at, multiplier, source)
  VALUES (auth.uid(),
          now() + make_interval(mins => GREATEST(5, LEAST(120, p_minutes))),
          GREATEST(1.0, LEAST(3.0, p_multiplier)),
          COALESCE(p_source,'manual'))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.magnetic_activate(int,numeric,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. PASS VIP SOCIAL
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_vip_social_pass (
  user_id uuid PRIMARY KEY,
  tier text NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard','plus','elite')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  perks jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oculto_vip_social_pass ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vip pass read self" ON public.oculto_vip_social_pass;
CREATE POLICY "vip pass read self" ON public.oculto_vip_social_pass
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.vip_social_pass_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'active', COALESCE(p.ends_at > now(), false),
    'tier', p.tier,
    'ends_at', p.ends_at,
    'perks', p.perks
  )
  FROM public.oculto_vip_social_pass p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.vip_social_pass_status() TO authenticated;

-- ---------------------------------------------------------------------
-- 6. CONEXÕES OCULTAS (descobertas raras limitadas / dia)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_hidden_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_user uuid NOT NULL,
  rarity text NOT NULL DEFAULT 'rare' CHECK (rarity IN ('rare','epic','mythic')),
  hint text,
  revealed boolean NOT NULL DEFAULT false,
  revealed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id <> target_user)
);
CREATE INDEX IF NOT EXISTS idx_hidden_conn_user ON public.oculto_hidden_connections (user_id, expires_at DESC);

ALTER TABLE public.oculto_hidden_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hidden conn read self" ON public.oculto_hidden_connections;
CREATE POLICY "hidden conn read self" ON public.oculto_hidden_connections
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.hidden_connections_today()
RETURNS TABLE(id uuid, target_user uuid, rarity text, hint text,
              revealed boolean, expires_at timestamptz,
              username text, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.id, h.target_user, h.rarity, h.hint, h.revealed, h.expires_at,
         pr.username, pr.display_name,
         CASE WHEN h.revealed THEN pr.avatar_url ELSE NULL END
  FROM public.oculto_hidden_connections h
  LEFT JOIN public.profiles pr ON pr.id = h.target_user OR pr.user_id = h.target_user
  WHERE h.user_id = auth.uid() AND h.expires_at > now()
  ORDER BY h.created_at DESC LIMIT 5;
$$;
GRANT EXECUTE ON FUNCTION public.hidden_connections_today() TO authenticated;

CREATE OR REPLACE FUNCTION public.hidden_connection_reveal(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.oculto_hidden_connections
     SET revealed = true, revealed_at = now()
   WHERE id = p_id AND user_id = auth.uid() AND expires_at > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.hidden_connection_reveal(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 7. EXPERIÊNCIAS REAIS (lounges/encontros locais com consent)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_real_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lounge','encontro','evento_local','experiencia')),
  title text NOT NULL,
  description text,
  city text,
  state text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  capacity int NOT NULL DEFAULT 20,
  vip_only boolean NOT NULL DEFAULT false,
  requires_kyc boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending_moderation'
    CHECK (status IN ('pending_moderation','approved','rejected','cancelled','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_real_exp_status_starts ON public.oculto_real_experiences (status, starts_at);
ALTER TABLE public.oculto_real_experiences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "real exp read approved or own" ON public.oculto_real_experiences;
CREATE POLICY "real exp read approved or own" ON public.oculto_real_experiences
  FOR SELECT TO authenticated
  USING (status = 'approved' OR host_user = auth.uid());

CREATE TABLE IF NOT EXISTS public.oculto_real_experience_rsvps (
  experience_id uuid NOT NULL REFERENCES public.oculto_real_experiences(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'going' CHECK (status IN ('going','interested','cancelled')),
  consent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experience_id, user_id)
);
ALTER TABLE public.oculto_real_experience_rsvps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rsvps read self" ON public.oculto_real_experience_rsvps;
CREATE POLICY "rsvps read self" ON public.oculto_real_experience_rsvps
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "rsvps insert self" ON public.oculto_real_experience_rsvps;
CREATE POLICY "rsvps insert self" ON public.oculto_real_experience_rsvps
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.real_experiences_upcoming(p_limit int DEFAULT 20)
RETURNS TABLE(id uuid, kind text, title text, description text,
              city text, state text, starts_at timestamptz, ends_at timestamptz,
              capacity int, vip_only boolean, requires_kyc boolean,
              host_user uuid, going_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.kind, e.title, e.description, e.city, e.state,
         e.starts_at, e.ends_at, e.capacity, e.vip_only, e.requires_kyc,
         e.host_user,
         (SELECT count(*)::int FROM public.oculto_real_experience_rsvps r
           WHERE r.experience_id = e.id AND r.status = 'going') AS going_count
  FROM public.oculto_real_experiences e
  WHERE e.status = 'approved' AND e.starts_at > now()
  ORDER BY e.starts_at ASC
  LIMIT GREATEST(1, LEAST(50, p_limit));
$$;
GRANT EXECUTE ON FUNCTION public.real_experiences_upcoming(int) TO authenticated;

-- ---------------------------------------------------------------------
-- 8. FEED VIVO — eventos do universo no feed (não-spam)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_feed_vivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('noite','tempestade','season','destiny','hidden','real_exp','milestone')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  hue smallint DEFAULT 280,
  emoji text DEFAULT '✨',
  pinned boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feed_vivo_active ON public.oculto_feed_vivo (expires_at DESC);
ALTER TABLE public.oculto_feed_vivo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feed vivo read active" ON public.oculto_feed_vivo;
CREATE POLICY "feed vivo read active" ON public.oculto_feed_vivo
  FOR SELECT TO authenticated USING (expires_at > now());

CREATE OR REPLACE FUNCTION public.feed_vivo_recent(p_limit int DEFAULT 8)
RETURNS TABLE(id uuid, kind text, payload jsonb, hue smallint, emoji text,
              pinned boolean, expires_at timestamptz, created_at timestamptz,
              remaining_seconds int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.kind, f.payload, f.hue, f.emoji, f.pinned, f.expires_at, f.created_at,
         GREATEST(0, EXTRACT(EPOCH FROM (f.expires_at - now()))::int)
  FROM public.oculto_feed_vivo f
  WHERE f.expires_at > now()
  ORDER BY f.pinned DESC, f.created_at DESC
  LIMIT GREATEST(1, LEAST(20, p_limit));
$$;
GRANT EXECUTE ON FUNCTION public.feed_vivo_recent(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
