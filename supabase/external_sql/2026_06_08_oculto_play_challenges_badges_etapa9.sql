-- =====================================================================
-- ETAPA 9 — OCULTO PLAY: Desafios + Badges + Limites por ação
-- Idempotente. Roda no Supabase EXTERNO.
-- Estende sistema XP já existente (oculto_play_xp_log / oculto_play_xp_grant).
-- =====================================================================

-- ---------- 1) Desafios ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'weekly',  -- weekly | meme | audio | theme_day | theme_week
  accepted_types text[] NOT NULL DEFAULT ARRAY['video','audio','image']::text[],
  starts_at timestamptz,
  ends_at timestamptz,
  xp_reward int NOT NULL DEFAULT 50,
  badge_code text,                       -- opcional: concede badge ao concluir
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oculto_play_challenges ADD COLUMN IF NOT EXISTS accepted_types text[] NOT NULL DEFAULT ARRAY['video','audio','image']::text[];
ALTER TABLE public.oculto_play_challenges ADD COLUMN IF NOT EXISTS badge_code text;
ALTER TABLE public.oculto_play_challenges ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'weekly';

GRANT SELECT ON public.oculto_play_challenges TO anon, authenticated;
GRANT ALL ON public.oculto_play_challenges TO service_role;
ALTER TABLE public.oculto_play_challenges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY oculto_chal_read ON public.oculto_play_challenges
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY oculto_chal_master_all ON public.oculto_play_challenges
    FOR ALL TO authenticated
    USING (public.is_master_admin(auth.uid()))
    WITH CHECK (public.is_master_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_oculto_chal_active ON public.oculto_play_challenges(is_active, ends_at);

-- ---------- 2) Submissões de desafio ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_challenge_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.oculto_play_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  item_id uuid NOT NULL,                 -- oculto_play_items.id
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  xp_awarded int NOT NULL DEFAULT 0,
  reviewer_id uuid,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (challenge_id, item_id)
);

GRANT SELECT, INSERT ON public.oculto_play_challenge_submissions TO authenticated;
GRANT ALL ON public.oculto_play_challenge_submissions TO service_role;
ALTER TABLE public.oculto_play_challenge_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY oculto_csub_owner_read ON public.oculto_play_challenge_submissions
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_master_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY oculto_csub_owner_insert ON public.oculto_play_challenge_submissions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY oculto_csub_master_update ON public.oculto_play_challenge_submissions
    FOR UPDATE TO authenticated
    USING (public.is_master_admin(auth.uid()))
    WITH CHECK (public.is_master_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_oculto_csub_chal ON public.oculto_play_challenge_submissions(challenge_id, status);
CREATE INDEX IF NOT EXISTS idx_oculto_csub_user ON public.oculto_play_challenge_submissions(user_id, created_at DESC);

-- ---------- 3) Catálogo de Badges ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_badges (
  code text PRIMARY KEY,                 -- ex: 'criador_play', 'voz_oculta'
  name text NOT NULL,
  description text,
  icon text,                             -- nome de ícone lucide ou emoji
  criteria text,                         -- texto descritivo do critério
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oculto_play_badges TO anon, authenticated;
GRANT ALL ON public.oculto_play_badges TO service_role;
ALTER TABLE public.oculto_play_badges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY oculto_badge_read ON public.oculto_play_badges
    FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY oculto_badge_master_all ON public.oculto_play_badges
    FOR ALL TO authenticated
    USING (public.is_master_admin(auth.uid()))
    WITH CHECK (public.is_master_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed inicial idempotente
INSERT INTO public.oculto_play_badges(code, name, description, icon, criteria) VALUES
  ('criador_play',           'Criador Play',            'Publicou conteúdo aprovado no Play',           'Sparkles', 'Aprovar 1 publicação'),
  ('voz_oculta',             'Voz Oculta',              'Áudio autoral aprovado',                       'Mic',      'Aprovar 1 áudio autoral'),
  ('memeiro_oculto',         'Memeiro Oculto',          'Meme em alta no Play',                         'Laugh',    'Conteúdo em alta com tag meme'),
  ('explorador_madrugada',   'Explorador da Madrugada', 'Atividade entre 00h e 5h',                     'Moon',     'Interação na madrugada'),
  ('comentador_ativo',       'Comentador Ativo',        'Comentários qualificados recorrentes',         'MessageCircle', '20 comentários aprovados'),
  ('conteudo_em_alta',       'Conteúdo em Alta',        'Item subiu para destaque',                     'Flame',    'Item em trending'),
  ('som_autoral',            'Som Autoral',             'Trilha autoral usada por outros',              'Music',    'Trilha reaproveitada'),
  ('comunidade_viva',        'Comunidade Viva',         'Participação em comunidade via Play',          'Users',    'Engajar comunidade via Play')
ON CONFLICT (code) DO NOTHING;

-- ---------- 4) Badges conquistados por usuário ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_code text NOT NULL REFERENCES public.oculto_play_badges(code) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, badge_code)
);

GRANT SELECT ON public.oculto_play_user_badges TO authenticated;
GRANT ALL ON public.oculto_play_user_badges TO service_role;
ALTER TABLE public.oculto_play_user_badges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY oculto_ubadge_owner_read ON public.oculto_play_user_badges
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_master_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_oculto_ubadge_user ON public.oculto_play_user_badges(user_id, awarded_at DESC);

-- ---------- 5) Limites por ação (extensão do config) ----------
ALTER TABLE public.oculto_play_config ADD COLUMN IF NOT EXISTS xp_daily_cap int NOT NULL DEFAULT 300;
ALTER TABLE public.oculto_play_config ADD COLUMN IF NOT EXISTS xp_per_action_limits jsonb NOT NULL DEFAULT '{
  "view": 30, "like": 30, "save": 20, "share": 15, "comment": 20, "upload": 5
}'::jsonb;

-- ---------- 6) RPC: desafios ativos ----------
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

-- ---------- 7) RPC: enviar item para desafio ----------
CREATE OR REPLACE FUNCTION public.oculto_play_challenge_submit(
  p_challenge_id uuid,
  p_item_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_active boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT (is_active AND (starts_at IS NULL OR starts_at <= now())
                    AND (ends_at IS NULL OR ends_at > now()))
    INTO v_active FROM public.oculto_play_challenges WHERE id = p_challenge_id;
  IF NOT COALESCE(v_active, false) THEN RAISE EXCEPTION 'challenge_inactive'; END IF;

  INSERT INTO public.oculto_play_challenge_submissions(challenge_id, user_id, item_id)
  VALUES (p_challenge_id, v_uid, p_item_id)
  ON CONFLICT (challenge_id, item_id) DO UPDATE SET status = oculto_play_challenge_submissions.status
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_challenge_submit(uuid, uuid) TO authenticated;

-- ---------- 8) RPC: master aprova/rejeita submissão ----------
CREATE OR REPLACE FUNCTION public.oculto_play_challenge_review(
  p_submission_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_user uuid; v_chal uuid; v_xp int; v_badge text;
BEGIN
  IF NOT public.is_master_admin(v_uid) THEN RAISE EXCEPTION 'master_admin_only'; END IF;

  SELECT user_id, challenge_id INTO v_user, v_chal
    FROM public.oculto_play_challenge_submissions WHERE id = p_submission_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT xp_reward, badge_code INTO v_xp, v_badge
    FROM public.oculto_play_challenges WHERE id = v_chal;

  UPDATE public.oculto_play_challenge_submissions
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewer_id = v_uid, reviewer_note = p_note, reviewed_at = now(),
         xp_awarded = CASE WHEN p_approve THEN COALESCE(v_xp,0) ELSE 0 END
   WHERE id = p_submission_id;

  IF p_approve THEN
    -- registra XP no ledger (bypass do cap diário para recompensa de desafio)
    INSERT INTO public.oculto_play_xp_log(user_id, item_id, action, xp)
    SELECT v_user, item_id, 'challenge_reward', COALESCE(v_xp,0)
      FROM public.oculto_play_challenge_submissions WHERE id = p_submission_id
    ON CONFLICT DO NOTHING;

    -- concede badge se configurado
    IF v_badge IS NOT NULL THEN
      INSERT INTO public.oculto_play_user_badges(user_id, badge_code, context)
      VALUES (v_user, v_badge, jsonb_build_object('challenge_id', v_chal))
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_challenge_review(uuid, boolean, text) TO authenticated;

-- ---------- 9) RPC: badges do usuário ----------
CREATE OR REPLACE FUNCTION public.oculto_play_my_badges()
RETURNS TABLE (
  code text, name text, description text, icon text, awarded_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.code, b.name, b.description, b.icon, ub.awarded_at
    FROM public.oculto_play_user_badges ub
    JOIN public.oculto_play_badges b ON b.code = ub.badge_code
   WHERE ub.user_id = auth.uid()
   ORDER BY ub.awarded_at DESC
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_my_badges() TO authenticated;

-- ---------- 10) Trigger: auto-badge "Criador Play" ao publicar ----------
CREATE OR REPLACE FUNCTION public.tg_oculto_play_award_creator_badge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_published = true AND (TG_OP = 'INSERT' OR OLD.is_published IS DISTINCT FROM NEW.is_published) THEN
    INSERT INTO public.oculto_play_user_badges(user_id, badge_code, context)
    VALUES (NEW.author_id, 'criador_play', jsonb_build_object('item_id', NEW.id))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oculto_play_creator_badge ON public.oculto_play_items;
CREATE TRIGGER trg_oculto_play_creator_badge
  AFTER INSERT OR UPDATE OF is_published ON public.oculto_play_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_oculto_play_award_creator_badge();

-- ---------- 11) Updated_at ----------
CREATE OR REPLACE FUNCTION public.tg_oculto_chal_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_oculto_chal_updated ON public.oculto_play_challenges;
CREATE TRIGGER trg_oculto_chal_updated BEFORE UPDATE ON public.oculto_play_challenges
  FOR EACH ROW EXECUTE FUNCTION public.tg_oculto_chal_updated();

NOTIFY pgrst, 'reload schema';
