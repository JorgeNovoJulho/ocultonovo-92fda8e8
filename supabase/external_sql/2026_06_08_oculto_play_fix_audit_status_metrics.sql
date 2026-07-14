-- ============================================================================
-- OCULTO PLAY — FIX FINAL: audit_logs.status + métricas Play resilientes
-- Banco EXTERNO. 100% idempotente.
-- Resolve: ERROR 42703: column "status" does not exist
-- ============================================================================

-- 1) Corrige audit_logs.status sem quebrar schema existente ------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success';

DO $$ BEGIN
  ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_status_chk
    CHECK (status IN ('success','error','warning','info','pending','processed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_status_created
  ON public.audit_logs(status, created_at DESC);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- 2) Garante tabelas da Etapa 9 (desafios/badges) ----------------------------
CREATE TABLE IF NOT EXISTS public.oculto_play_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'weekly',
  accepted_types text[] NOT NULL DEFAULT ARRAY['video','audio','image']::text[],
  starts_at timestamptz,
  ends_at timestamptz,
  xp_reward int NOT NULL DEFAULT 50,
  badge_code text,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_play_challenges
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS accepted_types text[] NOT NULL DEFAULT ARRAY['video','audio','image']::text[],
  ADD COLUMN IF NOT EXISTS badge_code text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

GRANT SELECT ON public.oculto_play_challenges TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.oculto_play_challenges TO authenticated;
GRANT ALL ON public.oculto_play_challenges TO service_role;
ALTER TABLE public.oculto_play_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oculto_chal_read ON public.oculto_play_challenges;
CREATE POLICY oculto_chal_read ON public.oculto_play_challenges
  FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin_master'));

DROP POLICY IF EXISTS oculto_chal_master_all ON public.oculto_play_challenges;
CREATE POLICY oculto_chal_master_all ON public.oculto_play_challenges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

CREATE INDEX IF NOT EXISTS idx_oculto_chal_active
  ON public.oculto_play_challenges(is_active, ends_at);

CREATE TABLE IF NOT EXISTS public.oculto_play_challenge_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.oculto_play_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  item_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  xp_awarded int NOT NULL DEFAULT 0,
  reviewer_id uuid,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (challenge_id, item_id)
);

GRANT SELECT, INSERT ON public.oculto_play_challenge_submissions TO authenticated;
GRANT UPDATE ON public.oculto_play_challenge_submissions TO authenticated;
GRANT ALL ON public.oculto_play_challenge_submissions TO service_role;
ALTER TABLE public.oculto_play_challenge_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oculto_csub_owner_read ON public.oculto_play_challenge_submissions;
CREATE POLICY oculto_csub_owner_read ON public.oculto_play_challenge_submissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin_master'));

DROP POLICY IF EXISTS oculto_csub_owner_insert ON public.oculto_play_challenge_submissions;
CREATE POLICY oculto_csub_owner_insert ON public.oculto_play_challenge_submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS oculto_csub_master_update ON public.oculto_play_challenge_submissions;
CREATE POLICY oculto_csub_master_update ON public.oculto_play_challenge_submissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

CREATE INDEX IF NOT EXISTS idx_oculto_csub_chal
  ON public.oculto_play_challenge_submissions(challenge_id, status);
CREATE INDEX IF NOT EXISTS idx_oculto_csub_user
  ON public.oculto_play_challenge_submissions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.oculto_play_badges (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon text,
  criteria text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oculto_play_badges TO anon, authenticated;
GRANT ALL ON public.oculto_play_badges TO service_role;
ALTER TABLE public.oculto_play_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oculto_badge_read ON public.oculto_play_badges;
CREATE POLICY oculto_badge_read ON public.oculto_play_badges FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS oculto_badge_master_all ON public.oculto_play_badges;
CREATE POLICY oculto_badge_master_all ON public.oculto_play_badges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

INSERT INTO public.oculto_play_badges(code, name, description, icon, criteria) VALUES
  ('criador_play','Criador Play','Publicou conteúdo aprovado no Play','Sparkles','Aprovar 1 publicação'),
  ('voz_oculta','Voz Oculta','Áudio autoral aprovado','Mic','Aprovar 1 áudio autoral'),
  ('memeiro_oculto','Memeiro Oculto','Meme em alta no Play','Laugh','Conteúdo em alta com tag meme'),
  ('explorador_madrugada','Explorador da Madrugada','Atividade entre 00h e 5h','Moon','Interação na madrugada'),
  ('comentador_ativo','Comentador Ativo','Comentários qualificados recorrentes','MessageCircle','20 comentários aprovados'),
  ('conteudo_em_alta','Conteúdo em Alta','Item subiu para destaque','Flame','Item em trending'),
  ('som_autoral','Som Autoral','Trilha autoral usada por outros','Music','Trilha reaproveitada'),
  ('comunidade_viva','Comunidade Viva','Participação em comunidade via Play','Users','Engajar comunidade via Play')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.oculto_play_user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_code text NOT NULL REFERENCES public.oculto_play_badges(code) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, badge_code)
);

GRANT SELECT ON public.oculto_play_user_badges TO authenticated;
GRANT INSERT ON public.oculto_play_user_badges TO authenticated;
GRANT ALL ON public.oculto_play_user_badges TO service_role;
ALTER TABLE public.oculto_play_user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oculto_ubadge_owner_read ON public.oculto_play_user_badges;
CREATE POLICY oculto_ubadge_owner_read ON public.oculto_play_user_badges
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin_master'));

DROP POLICY IF EXISTS oculto_ubadge_master_insert ON public.oculto_play_user_badges;
CREATE POLICY oculto_ubadge_master_insert ON public.oculto_play_user_badges
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

CREATE INDEX IF NOT EXISTS idx_oculto_ubadge_user
  ON public.oculto_play_user_badges(user_id, awarded_at DESC);

-- 3) RPCs de desafios ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_challenges_active(p_limit int DEFAULT 6)
RETURNS SETOF public.oculto_play_challenges
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.oculto_play_challenges
   WHERE is_active = true
     AND (starts_at IS NULL OR starts_at <= now())
     AND (ends_at IS NULL OR ends_at > now())
   ORDER BY is_featured DESC, COALESCE(ends_at, now() + interval '999 days') ASC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit,6), 20))
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_challenges_active(int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_challenge_submit(p_challenge_id uuid, p_item_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_active boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT (is_active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()))
    INTO v_active FROM public.oculto_play_challenges WHERE id = p_challenge_id;
  IF NOT COALESCE(v_active, false) THEN RAISE EXCEPTION 'challenge_inactive'; END IF;

  INSERT INTO public.oculto_play_challenge_submissions(challenge_id, user_id, item_id)
  VALUES (p_challenge_id, v_uid, p_item_id)
  ON CONFLICT (challenge_id, item_id) DO UPDATE SET item_id = EXCLUDED.item_id
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_challenge_submit(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_my_badges()
RETURNS TABLE (code text, name text, description text, icon text, awarded_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.code, b.name, b.description, b.icon, ub.awarded_at
    FROM public.oculto_play_user_badges ub
    JOIN public.oculto_play_badges b ON b.code = ub.badge_code
   WHERE ub.user_id = auth.uid()
   ORDER BY ub.awarded_at DESC
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_my_badges() TO authenticated;

-- 4) Métricas finais corrigidas para schema real (watched_seconds) ------------
CREATE TABLE IF NOT EXISTS public.oculto_play_outbound_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid,
  target_kind text NOT NULL CHECK (target_kind IN ('vip_channel','vip_subscription','community','community_topic','profile','chat','follow')),
  target_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.oculto_play_outbound_clicks TO authenticated;
GRANT ALL ON public.oculto_play_outbound_clicks TO service_role;
ALTER TABLE public.oculto_play_outbound_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbound_self_insert ON public.oculto_play_outbound_clicks;
CREATE POLICY outbound_self_insert ON public.oculto_play_outbound_clicks
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS outbound_self_read ON public.oculto_play_outbound_clicks;
CREATE POLICY outbound_self_read ON public.oculto_play_outbound_clicks
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin_master'));

CREATE INDEX IF NOT EXISTS idx_oculto_play_outbound_created
  ON public.oculto_play_outbound_clicks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_play_outbound_kind
  ON public.oculto_play_outbound_clicks(target_kind, created_at DESC);

CREATE OR REPLACE FUNCTION public.oculto_play_track_outbound(p_item_id uuid, p_kind text, p_target_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.oculto_play_outbound_clicks(user_id, item_id, target_kind, target_id)
  VALUES (v_uid, p_item_id, p_kind, p_target_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_track_outbound(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.oculto_play_admin_metrics(integer);
CREATE OR REPLACE FUNCTION public.oculto_play_admin_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_since timestamptz := now() - make_interval(days => GREATEST(1, COALESCE(p_days, 30)));
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
  IF NOT public.has_role(v_uid, 'admin_master') THEN RETURN jsonb_build_object('error','forbidden'); END IF;

  WITH v AS (
    SELECT user_id, item_id, completed, watched_seconds, created_at, last_seen_at
      FROM public.oculto_play_views
     WHERE COALESCE(last_seen_at, created_at) >= v_since
  ), daily_users AS (
    SELECT date_trunc('day', COALESCE(last_seen_at, created_at))::date AS d, count(DISTINCT user_id) AS u
      FROM v GROUP BY 1
  ), totals AS (
    SELECT
      (SELECT count(*) FROM v) AS total_views,
      (SELECT count(*) FROM v WHERE completed) AS completed_views,
      (SELECT COALESCE(avg(watched_seconds),0)::numeric(10,2) FROM v WHERE watched_seconds > 0) AS avg_seconds,
      (SELECT count(DISTINCT user_id) FROM v) AS active_users,
      (SELECT count(*) FROM public.oculto_play_likes WHERE created_at >= v_since) AS likes,
      (SELECT count(*) FROM public.oculto_play_saves WHERE created_at >= v_since) AS saves,
      (SELECT count(*) FROM public.oculto_play_comments WHERE created_at >= v_since) AS comments,
      (SELECT count(*) FROM public.oculto_play_items WHERE published_at >= v_since) AS items_published
  ), outbound AS (
    SELECT target_kind, count(*) AS c FROM public.oculto_play_outbound_clicks
     WHERE created_at >= v_since GROUP BY 1
  ), top_creators AS (
    SELECT i.author_id,
           COALESCE(p.username, '') AS username,
           COALESCE(p.display_name, p.name, '') AS display_name,
           p.avatar_url,
           count(DISTINCT i.id)::int AS items,
           COALESCE(sum(i.like_count),0)::int AS likes,
           COALESCE(sum(i.save_count),0)::int AS saves
      FROM public.oculto_play_items i
      LEFT JOIN public.profiles p ON p.id = i.author_id
     WHERE i.published_at >= v_since
     GROUP BY i.author_id, p.username, p.display_name, p.name, p.avatar_url
     ORDER BY (COALESCE(sum(i.like_count),0) + COALESCE(sum(i.save_count),0)) DESC
     LIMIT 10
  )
  SELECT jsonb_build_object(
    'window_days', p_days,
    'since', v_since,
    'totals', (SELECT row_to_json(totals) FROM totals),
    'daily_active_users', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day',d,'users',u) ORDER BY d), '[]'::jsonb) FROM daily_users),
    'outbound_by_kind', (SELECT COALESCE(jsonb_object_agg(target_kind, c), '{}'::jsonb) FROM outbound),
    'top_creators', (SELECT COALESCE(jsonb_agg(row_to_json(top_creators)), '[]'::jsonb) FROM top_creators)
  ) INTO v_result;

  RETURN v_result;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_admin_metrics(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';