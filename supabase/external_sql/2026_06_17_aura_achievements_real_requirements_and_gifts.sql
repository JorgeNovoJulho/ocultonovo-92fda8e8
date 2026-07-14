-- =====================================================================
-- Aura Match — Conquistas reais + presentes XP + premiação retroativa
-- Idempotente. Cole INTEIRO no SQL Editor do Supabase EXTERNO e execute.
-- Corrige: Doador de Aura não contando presentes de XP, requisitos
-- server-side das conquistas e saldo/nível atualizados em tempo real.
-- =====================================================================

-- 1) Colunas canônicas de Aura no perfil, sem apagar/restaurar valores.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_xp integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_level integer NOT NULL DEFAULT 1;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_streak_days integer NOT NULL DEFAULT 0;

-- 2) Fórmula única de nível Aura: floor(sqrt(xp / 50)) + 1.
CREATE OR REPLACE FUNCTION public.aura_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(
    1,
    FLOOR(SQRT(GREATEST(0, COALESCE(p_xp, 0))::numeric / 50))::integer + 1
  );
$$;

GRANT EXECUTE ON FUNCTION public.aura_level_from_xp(integer) TO anon, authenticated, service_role;

-- 3) Resolução canônica: nunca mistura usuários; sempre resolve para profiles.id.
DROP FUNCTION IF EXISTS public.aura_resolve_profile_id(uuid);
CREATE OR REPLACE FUNCTION public.aura_resolve_profile_id(p_any_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_any_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.id
    INTO v_profile_id
    FROM public.profiles p
   WHERE p.id = p_any_id
   ORDER BY p.created_at ASC NULLS LAST, p.id
   LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;
  END IF;

  SELECT p.id
    INTO v_profile_id
    FROM public.profiles p
   WHERE p.user_id = p_any_id
   ORDER BY p.created_at ASC NULLS LAST, p.id
   LIMIT 1;

  RETURN v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_resolve_profile_id(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.aura_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.aura_resolve_profile_id(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.aura_current_profile_id() TO authenticated, service_role;

-- 4) Tabela de presentes XP do Aura, usada pelo botão de presente XP.
CREATE TABLE IF NOT EXISTS public.oculto_aura_xp_gifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL,
  receiver_id uuid NOT NULL,
  amount      integer NOT NULL CHECK (amount > 0 AND amount <= 500),
  post_id     uuid NULL,
  seen_at     timestamptz NULL,
  thanked_at  timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_aura_xp_gifts
  ADD COLUMN IF NOT EXISTS post_id uuid NULL;

ALTER TABLE public.oculto_aura_xp_gifts
  ADD COLUMN IF NOT EXISTS seen_at timestamptz NULL;

ALTER TABLE public.oculto_aura_xp_gifts
  ADD COLUMN IF NOT EXISTS thanked_at timestamptz NULL;

ALTER TABLE public.oculto_aura_xp_gifts
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE ON public.oculto_aura_xp_gifts TO authenticated;
GRANT ALL ON public.oculto_aura_xp_gifts TO service_role;

CREATE INDEX IF NOT EXISTS idx_oculto_aura_xp_gifts_sender
  ON public.oculto_aura_xp_gifts (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_xp_gifts_receiver
  ON public.oculto_aura_xp_gifts (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_xp_gifts_post
  ON public.oculto_aura_xp_gifts (post_id)
  WHERE post_id IS NOT NULL;

ALTER TABLE public.oculto_aura_xp_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_xp_gifts_select_own" ON public.oculto_aura_xp_gifts;
DROP POLICY IF EXISTS "aura_xp_gifts_insert_own" ON public.oculto_aura_xp_gifts;
DROP POLICY IF EXISTS "aura_xp_gifts_update_receiver" ON public.oculto_aura_xp_gifts;

CREATE POLICY "aura_xp_gifts_select_own"
  ON public.oculto_aura_xp_gifts
  FOR SELECT
  TO authenticated
  USING (
    sender_id IN (auth.uid(), public.aura_current_profile_id())
    OR receiver_id IN (auth.uid(), public.aura_current_profile_id())
  );

CREATE POLICY "aura_xp_gifts_insert_own"
  ON public.oculto_aura_xp_gifts
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id IN (auth.uid(), public.aura_current_profile_id()));

CREATE POLICY "aura_xp_gifts_update_receiver"
  ON public.oculto_aura_xp_gifts
  FOR UPDATE
  TO authenticated
  USING (receiver_id IN (auth.uid(), public.aura_current_profile_id()))
  WITH CHECK (receiver_id IN (auth.uid(), public.aura_current_profile_id()));

-- 5) Tabela persistente de conquistas já premiadas: 1 crédito por usuário/conquista.
CREATE TABLE IF NOT EXISTS public.oculto_aura_achievement_claims (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  profile_id     uuid NULL,
  achievement_id text NOT NULL,
  xp_awarded     integer NOT NULL DEFAULT 0,
  claimed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

GRANT SELECT, INSERT ON public.oculto_aura_achievement_claims TO authenticated;
GRANT ALL ON public.oculto_aura_achievement_claims TO service_role;

ALTER TABLE public.oculto_aura_achievement_claims
  ADD COLUMN IF NOT EXISTS profile_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_oculto_aura_achievement_claims_user
  ON public.oculto_aura_achievement_claims (user_id, claimed_at DESC);

ALTER TABLE public.oculto_aura_achievement_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own claims read" ON public.oculto_aura_achievement_claims;
DROP POLICY IF EXISTS "own claims write" ON public.oculto_aura_achievement_claims;

CREATE POLICY "own claims read"
  ON public.oculto_aura_achievement_claims
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "own claims write"
  ON public.oculto_aura_achievement_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 6) RPC de envio de presente XP. Registra oculto_aura_xp_gifts e atualiza XP/nível na hora.
DROP FUNCTION IF EXISTS public.aura_send_xp_gift(uuid, integer);
DROP FUNCTION IF EXISTS public.aura_send_xp_gift(uuid, integer, uuid);

CREATE OR REPLACE FUNCTION public.aura_send_xp_gift(
  p_receiver_profile_id uuid,
  p_amount integer,
  p_post_id uuid DEFAULT NULL
)
RETURNS TABLE(
  success boolean,
  sender_xp integer,
  sender_level integer,
  receiver_xp integer,
  gift_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_profile uuid := public.aura_current_profile_id();
  v_receiver_profile uuid := public.aura_resolve_profile_id(p_receiver_profile_id);
  v_sender_xp integer;
  v_new_sender_xp integer;
  v_new_sender_level integer;
  v_new_receiver_xp integer;
  v_gift_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF v_sender_profile IS NULL THEN
    RAISE EXCEPTION 'sender profile not found';
  END IF;
  IF v_receiver_profile IS NULL THEN
    RAISE EXCEPTION 'receiver profile not found';
  END IF;
  IF v_receiver_profile = v_sender_profile THEN
    RAISE EXCEPTION 'cannot send gift to yourself';
  END IF;
  IF p_amount IS NULL OR p_amount < 5 OR p_amount > 500 THEN
    RAISE EXCEPTION 'amount must be between 5 and 500';
  END IF;

  SELECT COALESCE(p.aura_xp, 0)
    INTO v_sender_xp
    FROM public.profiles p
   WHERE p.id = v_sender_profile
   FOR UPDATE;

  PERFORM 1
    FROM public.profiles p
   WHERE p.id = v_receiver_profile
   FOR UPDATE;

  IF v_sender_xp < p_amount THEN
    RAISE EXCEPTION 'insufficient aura_xp (balance=%, need=%)', v_sender_xp, p_amount;
  END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) - p_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) - p_amount))
   WHERE id = v_sender_profile
   RETURNING aura_xp, aura_level
    INTO v_new_sender_xp, v_new_sender_level;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + p_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + p_amount))
   WHERE id = v_receiver_profile
   RETURNING aura_xp
    INTO v_new_receiver_xp;

  INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount, post_id)
  VALUES (v_sender_profile, v_receiver_profile, p_amount, p_post_id)
  RETURNING id INTO v_gift_id;

  BEGIN
    PERFORM public.aura_progress_quest('send_gift', 1);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT true, v_new_sender_xp, v_new_sender_level, v_new_receiver_xp, v_gift_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_send_xp_gift(uuid, integer, uuid) TO authenticated;

-- 7) Métricas reais das conquistas: conta ações existentes no banco, não localStorage.
DROP FUNCTION IF EXISTS public.aura_achievements_metrics();

CREATE OR REPLACE FUNCTION public.aura_achievements_metrics()
RETURNS TABLE(
  total_xp integer,
  current_level integer,
  current_streak integer,
  visit_days integer,
  quests_claimed integer,
  super_dm_quests integer,
  likes_quests integer,
  follows_quests integer,
  saves_quests integer,
  comments_quests integer,
  polls_quests integer,
  gifts_quests integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid;
  v_ids uuid[];
  v_profile_xp integer := 0;
  v_profile_level integer := 1;
  v_profile_streak integer := 0;
  v_level_xp integer := 0;
  v_level_level integer := 1;
  v_level_streak integer := 0;
  v_ledger_xp integer := 0;
  v_claim_xp integer := 0;
  v_visit_days integer := 0;
  v_likes integer := 0;
  v_follows integer := 0;
  v_saves integer := 0;
  v_comments integer := 0;
  v_polls integer := 0;
  v_chat_gifts integer := 0;
  v_aura_gifts integer := 0;
  v_super_dms integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_pid := public.aura_current_profile_id();
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[v_uid, v_pid]) AS x WHERE x IS NOT NULL) INTO v_ids;

  SELECT COALESCE(MAX(p.aura_xp), 0),
         COALESCE(MAX(p.aura_level), 1),
         COALESCE(MAX(p.aura_streak_days), 0)
    INTO v_profile_xp, v_profile_level, v_profile_streak
    FROM public.profiles p
   WHERE p.id = ANY(v_ids) OR p.user_id = v_uid;

  SELECT COALESCE(MAX(ul.total_xp), 0),
         COALESCE(MAX(ul.current_level), 1),
         COALESCE(MAX(ul.streak_days), 0)
    INTO v_level_xp, v_level_level, v_level_streak
    FROM public.user_levels ul
   WHERE ul.user_id = ANY(v_ids);

  SELECT COALESCE(SUM(GREATEST(0, xt.amount)), 0)::integer
    INTO v_ledger_xp
    FROM public.xp_transactions xt
   WHERE xt.user_id = ANY(v_ids);

  SELECT COALESCE(SUM(GREATEST(0, c.xp_awarded)), 0)::integer
    INTO v_claim_xp
    FROM public.oculto_aura_achievement_claims c
   WHERE c.user_id = v_uid OR c.profile_id = v_pid;

  SELECT COALESCE(COUNT(DISTINCT d), 0)::integer
    INTO v_visit_days
    FROM (
      SELECT xt.created_at::date AS d FROM public.xp_transactions xt WHERE xt.user_id = ANY(v_ids)
      UNION
      SELECT ee.created_at::date AS d FROM public.engagement_events ee WHERE ee.user_id = ANY(v_ids)
    ) days;

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_likes
    FROM public.post_likes pl
   WHERE pl.user_id = ANY(v_ids);

  SELECT v_likes + COALESCE(COUNT(*), 0)::integer INTO v_likes
    FROM public.profile_likes pfl
   WHERE pfl.liker_id = ANY(v_ids);

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_follows
    FROM public.follows f
   WHERE f.follower_id = ANY(v_ids);

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_saves
    FROM public.saved_posts sp
   WHERE sp.user_id = ANY(v_ids);

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_comments
    FROM public.post_comments pc
   WHERE pc.user_id = ANY(v_ids)
     AND COALESCE(pc.is_hidden, false) = false;

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_polls
    FROM public.poll_votes pv
   WHERE pv.voter_id = ANY(v_ids);

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_chat_gifts
    FROM public.gift_history gh
   WHERE gh.sender_id = ANY(v_ids)
     AND COALESCE(gh.is_visible, true) = true;

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_aura_gifts
    FROM public.oculto_aura_xp_gifts ag
   WHERE ag.sender_id = ANY(v_ids);

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_super_dms
    FROM public.priority_message_transactions pmt
   WHERE pmt.sender_profile_id = ANY(v_ids);

  SELECT GREATEST(
           v_super_dms,
           COALESCE(COUNT(*), 0)::integer
         ) INTO v_super_dms
    FROM public.messages m
   WHERE m.sender_id = ANY(v_ids)
     AND COALESCE(m.is_priority, false) = true;

  total_xp := GREATEST(v_profile_xp, v_level_xp, v_ledger_xp, v_claim_xp);
  current_level := GREATEST(v_profile_level, v_level_level, public.aura_level_from_xp(total_xp));
  current_streak := GREATEST(v_profile_streak, v_level_streak);
  visit_days := GREATEST(current_streak, v_visit_days);
  likes_quests := v_likes;
  follows_quests := v_follows;
  saves_quests := v_saves;
  comments_quests := v_comments;
  polls_quests := v_polls;
  gifts_quests := v_chat_gifts + v_aura_gifts;
  super_dm_quests := v_super_dms;
  quests_claimed := likes_quests + follows_quests + saves_quests + comments_quests + polls_quests + gifts_quests + super_dm_quests;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;

-- 8) Claim com validação server-side: só premia se o requisito real já foi atingido.
DROP FUNCTION IF EXISTS public.aura_achievement_claim(text, integer);

CREATE OR REPLACE FUNCTION public.aura_achievement_claim(
  p_achievement_id text,
  p_xp_reward integer
)
RETURNS TABLE(
  awarded boolean,
  xp_total integer,
  level integer,
  eligible boolean,
  current_value integer,
  required_value integer,
  already_claimed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid := public.aura_current_profile_id();
  v_metrics record;
  v_current integer := 0;
  v_required integer := 0;
  v_safe_xp integer;
  v_inserted integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF p_achievement_id IS NULL OR length(trim(p_achievement_id)) = 0 THEN
    RAISE EXCEPTION 'achievement id required';
  END IF;
  IF p_xp_reward IS NULL OR p_xp_reward <= 0 THEN
    RAISE EXCEPTION 'xp reward must be positive';
  END IF;

  SELECT * INTO v_metrics FROM public.aura_achievements_metrics() LIMIT 1;

  CASE p_achievement_id
    WHEN 'lvl_5' THEN v_current := v_metrics.current_level; v_required := 5;
    WHEN 'lvl_10' THEN v_current := v_metrics.current_level; v_required := 10;
    WHEN 'lvl_20' THEN v_current := v_metrics.current_level; v_required := 20;
    WHEN 'lvl_50' THEN v_current := v_metrics.current_level; v_required := 50;
    WHEN 'streak_3' THEN v_current := v_metrics.current_streak; v_required := 3;
    WHEN 'streak_7' THEN v_current := v_metrics.current_streak; v_required := 7;
    WHEN 'streak_30' THEN v_current := v_metrics.current_streak; v_required := 30;
    WHEN 'visits_15' THEN v_current := v_metrics.visit_days; v_required := 15;
    WHEN 'visits_30' THEN v_current := v_metrics.visit_days; v_required := 30;
    WHEN 'quests_10' THEN v_current := v_metrics.quests_claimed; v_required := 10;
    WHEN 'quests_50' THEN v_current := v_metrics.quests_claimed; v_required := 50;
    WHEN 'quests_200' THEN v_current := v_metrics.quests_claimed; v_required := 200;
    WHEN 'sdm_5' THEN v_current := v_metrics.super_dm_quests; v_required := 5;
    WHEN 'xp_1000' THEN v_current := v_metrics.total_xp; v_required := 1000;
    WHEN 'xp_10000' THEN v_current := v_metrics.total_xp; v_required := 10000;
    WHEN 'likes_5' THEN v_current := v_metrics.likes_quests; v_required := 5;
    WHEN 'likes_25' THEN v_current := v_metrics.likes_quests; v_required := 25;
    WHEN 'follows_5' THEN v_current := v_metrics.follows_quests; v_required := 5;
    WHEN 'follows_25' THEN v_current := v_metrics.follows_quests; v_required := 25;
    WHEN 'saves_5' THEN v_current := v_metrics.saves_quests; v_required := 5;
    WHEN 'saves_25' THEN v_current := v_metrics.saves_quests; v_required := 25;
    WHEN 'comments_5' THEN v_current := v_metrics.comments_quests; v_required := 5;
    WHEN 'comments_25' THEN v_current := v_metrics.comments_quests; v_required := 25;
    WHEN 'polls_5' THEN v_current := v_metrics.polls_quests; v_required := 5;
    WHEN 'gifts_3' THEN v_current := v_metrics.gifts_quests; v_required := 3;
    WHEN 'gifts_10' THEN v_current := v_metrics.gifts_quests; v_required := 10;
    ELSE
      RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id;
  END CASE;

  current_value := COALESCE(v_current, 0);
  required_value := COALESCE(v_required, 0);
  eligible := current_value >= required_value;

  SELECT EXISTS(
    SELECT 1
      FROM public.oculto_aura_achievement_claims c
     WHERE c.user_id = v_uid
       AND c.achievement_id = p_achievement_id
  ) INTO already_claimed;

  SELECT COALESCE(p.aura_xp, 0), COALESCE(p.aura_level, 1)
    INTO xp_total, level
    FROM public.profiles p
   WHERE p.id = v_pid;

  IF already_claimed THEN
    awarded := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT eligible THEN
    awarded := false;
    RETURN NEXT;
    RETURN;
  END IF;

  v_safe_xp := LEAST(10000, GREATEST(500, p_xp_reward));

  INSERT INTO public.oculto_aura_achievement_claims (user_id, profile_id, achievement_id, xp_awarded)
  VALUES (v_uid, v_pid, p_achievement_id, v_safe_xp)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    already_claimed := true;
    awarded := false;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp))
   WHERE id = v_pid
   RETURNING aura_xp, aura_level
    INTO xp_total, level;

  awarded := true;
  already_claimed := false;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievement_claim(text, integer) TO authenticated;

-- 9) Realtime para presentes e claims, para a UI atualizar sem recarregar.
ALTER TABLE public.oculto_aura_xp_gifts REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_aura_achievement_claims REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'oculto_aura_xp_gifts'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_xp_gifts';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'oculto_aura_achievement_claims'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_achievement_claims';
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 10) Sincroniza níveis nulos/zerados sem reduzir ninguém.
UPDATE public.profiles
   SET aura_level = GREATEST(COALESCE(aura_level, 1), public.aura_level_from_xp(COALESCE(aura_xp, 0)))
 WHERE COALESCE(aura_xp, 0) > 0;

NOTIFY pgrst, 'reload schema';
