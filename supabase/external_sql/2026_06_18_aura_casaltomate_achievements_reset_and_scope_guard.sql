-- =====================================================================
-- Aura Match — reset do @casaltomate + conquistas + blindagem anti-vazamento
-- Idempotente. Cole INTEIRO no SQL Editor do Supabase EXTERNO e execute.
--
-- O que faz:
--   1) preserva totalmente o @ocultomaster / @oculto_master;
--   2) seleciona @casaltomate e qualquer conta com sinais objetivos de
--      contaminação por dados do master;
--   3) reseta XP, nível, streak, claims/conquistas, raras e ledgers Aura;
--   4) restaura último snapshot seguro se existir; se não existir, fica zerado
--      no estado base (XP 0, nível 1, conquistas vazias);
--   5) recria guards e a RPC de claim com validação server-side para impedir
--      que qualquer outro usuário grave profile_id/conquistas de outra conta.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Tabelas base de conquistas / raras, com GRANTs e RLS.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_aura_achievement_claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  profile_id         uuid NULL,
  achievement_id     text NOT NULL,
  xp_awarded         integer NOT NULL DEFAULT 0,
  claimed_at         timestamptz NOT NULL DEFAULT now(),
  applied_to_balance boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, achievement_id)
);

GRANT SELECT, INSERT ON public.oculto_aura_achievement_claims TO authenticated;
GRANT ALL ON public.oculto_aura_achievement_claims TO service_role;

ALTER TABLE public.oculto_aura_achievement_claims
  ADD COLUMN IF NOT EXISTS profile_id uuid NULL;
ALTER TABLE public.oculto_aura_achievement_claims
  ADD COLUMN IF NOT EXISTS applied_to_balance boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_oculto_aura_achievement_claims_user
  ON public.oculto_aura_achievement_claims(user_id, claimed_at DESC);

ALTER TABLE public.oculto_aura_achievement_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own claims read" ON public.oculto_aura_achievement_claims;
CREATE POLICY "own claims read"
  ON public.oculto_aura_achievement_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own claims write" ON public.oculto_aura_achievement_claims;
CREATE POLICY "own claims write"
  ON public.oculto_aura_achievement_claims
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.oculto_aura_rare_unlocks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  profile_id          uuid NULL,
  achievement_id      text NOT NULL,
  achievement_title   text NULL,
  xp_awarded          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

GRANT SELECT ON public.oculto_aura_rare_unlocks TO authenticated, anon;
GRANT ALL ON public.oculto_aura_rare_unlocks TO service_role;

CREATE INDEX IF NOT EXISTS idx_oculto_aura_rare_unlocks_created
  ON public.oculto_aura_rare_unlocks(created_at DESC);

ALTER TABLE public.oculto_aura_rare_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rare unlocks public read" ON public.oculto_aura_rare_unlocks;
CREATE POLICY "rare unlocks public read"
  ON public.oculto_aura_rare_unlocks
  FOR SELECT TO authenticated, anon
  USING (true);

-- ---------------------------------------------------------------------
-- 1) Resolução canônica: auth.uid()/user_id SEMPRE vem antes de profile.id.
-- ---------------------------------------------------------------------
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

  SELECT p.id INTO v_profile_id
    FROM public.profiles p
   WHERE p.user_id = p_any_id
   ORDER BY p.created_at ASC NULLS LAST, p.id
   LIMIT 1;
  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;
  END IF;

  SELECT p.id INTO v_profile_id
    FROM public.profiles p
   WHERE p.id = p_any_id
   ORDER BY p.created_at ASC NULLS LAST, p.id
   LIMIT 1;

  RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.aura_resolve_profile_id(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.aura_resolve_profile_id(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_current_profile_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Guards: claims/raras nunca podem apontar para profile_id de outro user.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_claim_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'aura_claim_user_required';
  END IF;

  v_pid := public.aura_resolve_profile_id(NEW.user_id);
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'aura_claim_profile_not_found';
  END IF;

  NEW.profile_id := v_pid;
  IF NEW.xp_awarded IS NULL THEN NEW.xp_awarded := 0; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aura_claim_scope_guard ON public.oculto_aura_achievement_claims;
CREATE TRIGGER trg_aura_claim_scope_guard
BEFORE INSERT OR UPDATE ON public.oculto_aura_achievement_claims
FOR EACH ROW EXECUTE FUNCTION public.aura_claim_scope_guard();

DROP TRIGGER IF EXISTS trg_aura_rare_scope_guard ON public.oculto_aura_rare_unlocks;
CREATE TRIGGER trg_aura_rare_scope_guard
BEFORE INSERT OR UPDATE ON public.oculto_aura_rare_unlocks
FOR EACH ROW EXECUTE FUNCTION public.aura_claim_scope_guard();

-- ---------------------------------------------------------------------
-- 3) Claim v2 blindada: ignora valores manipuláveis do client e valida tudo
--    novamente no servidor com métricas do usuário autenticado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_achievement_claim_v2(
  p_achievement_id text,
  p_xp_reward integer,
  p_current integer,
  p_required integer,
  p_title text DEFAULT NULL
)
RETURNS TABLE(
  awarded boolean,
  xp_total integer,
  level integer,
  eligible boolean,
  already_claimed boolean,
  rare boolean
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
  v_notif_title text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
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
    WHEN 'comm_join_1' THEN v_current := v_metrics.communities_joined; v_required := 1;
    WHEN 'comm_join_5' THEN v_current := v_metrics.communities_joined; v_required := 5;
    WHEN 'comm_topics_3' THEN v_current := v_metrics.community_topics; v_required := 3;
    WHEN 'comm_topics_25' THEN v_current := v_metrics.community_topics; v_required := 25;
    WHEN 'play_pub_1' THEN v_current := v_metrics.play_publishes; v_required := 1;
    WHEN 'play_pub_10' THEN v_current := v_metrics.play_publishes; v_required := 10;
    WHEN 'play_views_1k' THEN v_current := v_metrics.play_views_total; v_required := 1000;
    WHEN 'chat_50' THEN v_current := v_metrics.chat_messages; v_required := 50;
    WHEN 'chat_500' THEN v_current := v_metrics.chat_messages; v_required := 500;
    WHEN 'rooms_join_3' THEN v_current := v_metrics.rooms_joined; v_required := 3;
    WHEN 'rooms_msgs_25' THEN v_current := v_metrics.rooms_messages; v_required := 25;
    WHEN 'match_1' THEN v_current := v_metrics.matches_total; v_required := 1;
    WHEN 'match_10' THEN v_current := v_metrics.matches_total; v_required := 10;
    WHEN 'match_50' THEN v_current := v_metrics.matches_total; v_required := 50;
    WHEN 'rank_top100' THEN v_current := CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 100 THEN 1 ELSE 0 END; v_required := 1;
    WHEN 'rank_top10' THEN v_current := CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 10 THEN 1 ELSE 0 END; v_required := 1;
    ELSE RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id;
  END CASE;

  eligible := COALESCE(v_current, 0) >= COALESCE(v_required, 0) AND COALESCE(v_required, 0) > 0;
  rare := p_xp_reward >= 10000;

  SELECT EXISTS(
    SELECT 1 FROM public.oculto_aura_achievement_claims c
     WHERE c.user_id = v_uid AND c.achievement_id = p_achievement_id
  ) INTO already_claimed;

  SELECT COALESCE(p.aura_xp, 0), COALESCE(p.aura_level, 1)
    INTO xp_total, level
    FROM public.profiles p
   WHERE p.id = v_pid
   FOR UPDATE;

  IF already_claimed OR NOT eligible THEN
    awarded := false;
    RETURN NEXT; RETURN;
  END IF;

  v_safe_xp := LEAST(10000, GREATEST(500, p_xp_reward));

  INSERT INTO public.oculto_aura_achievement_claims
    (user_id, profile_id, achievement_id, xp_awarded, applied_to_balance)
  VALUES (v_uid, v_pid, p_achievement_id, v_safe_xp, true)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    already_claimed := true;
    awarded := false;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp))
   WHERE id = v_pid
   RETURNING aura_xp, aura_level INTO xp_total, level;

  v_notif_title := COALESCE(NULLIF(trim(p_title), ''), 'Conquista desbloqueada');

  BEGIN
    INSERT INTO public.notifications(user_id, type, title, body, data)
    VALUES (
      v_uid,
      'system',
      CASE WHEN rare THEN 'Conquista RARA desbloqueada' ELSE 'Conquista desbloqueada' END,
      v_notif_title || ' · +' || v_safe_xp::text || ' XP',
      jsonb_build_object('kind','aura_achievement','achievement_id',p_achievement_id,'xp',v_safe_xp,'rare',rare)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF rare THEN
    INSERT INTO public.oculto_aura_rare_unlocks(user_id, profile_id, achievement_id, achievement_title, xp_awarded)
    VALUES (v_uid, v_pid, p_achievement_id, v_notif_title, v_safe_xp)
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  awarded := true;
  already_claimed := false;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievement_claim_v2(text, integer, integer, integer, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Seleção dos usuários contaminados. @ocultomaster nunca entra.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS _master_uid;
CREATE TEMP TABLE _master_uid(uid uuid, profile_id uuid, xp int, lvl int);

INSERT INTO _master_uid(uid, profile_id, xp, lvl)
SELECT user_id, id, COALESCE(aura_xp, 0), COALESCE(aura_level, 1)
  FROM public.profiles
 WHERE lower(username) IN ('ocultomaster', 'oculto_master', 'oculto.master')
 ORDER BY created_at ASC NULLS LAST, id
 LIMIT 1;

INSERT INTO _master_uid(uid, profile_id, xp, lvl)
SELECT NULL::uuid, NULL::uuid, -999999, -999999
WHERE NOT EXISTS (SELECT 1 FROM _master_uid);

DROP TABLE IF EXISTS _targets;
CREATE TEMP TABLE _targets(user_id uuid PRIMARY KEY, reason text NOT NULL DEFAULT 'manual');

INSERT INTO _targets(user_id, reason)
SELECT p.user_id, 'casaltomate_manual_reset'
  FROM public.profiles p, _master_uid m
 WHERE lower(p.username) = 'casaltomate'
   AND p.user_id IS NOT NULL
   AND p.user_id IS DISTINCT FROM m.uid
ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason;

INSERT INTO _targets(user_id, reason)
SELECT DISTINCT c.user_id, 'claim_profile_mismatch'
  FROM public.oculto_aura_achievement_claims c
  JOIN public.profiles p ON p.id = c.profile_id
  LEFT JOIN _master_uid m ON true
 WHERE p.user_id IS DISTINCT FROM c.user_id
   AND c.user_id IS DISTINCT FROM m.uid
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO _targets(user_id, reason)
SELECT DISTINCT r.user_id, 'rare_profile_mismatch'
  FROM public.oculto_aura_rare_unlocks r
  JOIN public.profiles p ON p.id = r.profile_id
  LEFT JOIN _master_uid m ON true
 WHERE p.user_id IS DISTINCT FROM r.user_id
   AND r.user_id IS DISTINCT FROM m.uid
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO _targets(user_id, reason)
SELECT p.user_id, 'same_xp_level_as_master'
  FROM public.profiles p
  JOIN _master_uid m ON true
 WHERE p.user_id IS DISTINCT FROM m.uid
   AND COALESCE(p.aura_xp, 0) = m.xp
   AND COALESCE(p.aura_level, 1) = m.lvl
   AND COALESCE(p.aura_xp, 0) > 0
ON CONFLICT (user_id) DO NOTHING;

DROP TABLE IF EXISTS _master_claim_set;
CREATE TEMP TABLE _master_claim_set AS
SELECT array_agg(c.achievement_id ORDER BY c.achievement_id) AS ids,
       COUNT(*)::int AS cnt
  FROM public.oculto_aura_achievement_claims c
  JOIN _master_uid m ON c.user_id = m.uid;

INSERT INTO _targets(user_id, reason)
SELECT u.user_id, 'same_achievement_set_as_master'
  FROM (
    SELECT c.user_id, array_agg(c.achievement_id ORDER BY c.achievement_id) AS ids, COUNT(*)::int AS cnt
      FROM public.oculto_aura_achievement_claims c
      LEFT JOIN _master_uid m ON true
     WHERE c.user_id IS DISTINCT FROM m.uid
     GROUP BY c.user_id
  ) u
  CROSS JOIN _master_claim_set mcs
 WHERE mcs.cnt > 0
   AND u.cnt = mcs.cnt
   AND u.ids = mcs.ids
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5) Último snapshot seguro antes da limpeza, se existir.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS _restore_snapshots;
CREATE TEMP TABLE _restore_snapshots(
  user_id uuid PRIMARY KEY,
  profile_id uuid,
  aura_xp integer,
  aura_level integer,
  aura_streak_days integer,
  achievements jsonb,
  rare_unlocks jsonb,
  snapshot_date date
);

DO $$
BEGIN
  IF to_regclass('public.oculto_aura_user_snapshots') IS NOT NULL THEN
    INSERT INTO _restore_snapshots(user_id, profile_id, aura_xp, aura_level, aura_streak_days, achievements, rare_unlocks, snapshot_date)
    SELECT DISTINCT ON (s.user_id)
           s.user_id,
           s.profile_id,
           COALESCE(s.aura_xp, 0),
           COALESCE(s.aura_level, 1),
           COALESCE(s.aura_streak_days, 0),
           COALESCE(s.achievements, '[]'::jsonb),
           COALESCE(s.rare_unlocks, '[]'::jsonb),
           s.snapshot_date
      FROM public.oculto_aura_user_snapshots s
      JOIN _targets t ON t.user_id = s.user_id
      LEFT JOIN _master_uid m ON true
     WHERE s.user_id IS DISTINCT FROM m.uid
       AND NOT (COALESCE(s.aura_xp, 0) = COALESCE(m.xp, -999999)
                AND COALESCE(s.aura_level, 1) = COALESCE(m.lvl, -999999)
                AND COALESCE(s.aura_xp, 0) > 0)
     ORDER BY s.user_id, s.snapshot_date DESC, s.created_at DESC;
  END IF;
END $$;

DROP TABLE IF EXISTS _restored_users;
CREATE TEMP TABLE _restored_users(user_id uuid PRIMARY KEY);

-- ---------------------------------------------------------------------
-- 6) Limpeza total dos itens Aura/conquistas dos alvos.
-- ---------------------------------------------------------------------
DELETE FROM public.oculto_aura_achievement_claims c
 USING _targets t, _master_uid m
 WHERE c.user_id = t.user_id
   AND c.user_id IS DISTINCT FROM m.uid;

DELETE FROM public.oculto_aura_rare_unlocks r
 USING _targets t, _master_uid m
 WHERE r.user_id = t.user_id
   AND r.user_id IS DISTINCT FROM m.uid;

DO $$
BEGIN
  IF to_regclass('public.user_achievements') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'user_id'
     ) THEN
    EXECUTE $sql$
      DELETE FROM public.user_achievements ua
       USING _targets t, _master_uid m
       WHERE ua.user_id = t.user_id
         AND ua.user_id IS DISTINCT FROM m.uid
    $sql$;
  END IF;

  IF to_regclass('public.user_levels') IS NOT NULL THEN
    DELETE FROM public.user_levels ul
     USING _targets t, _master_uid m
     WHERE ul.user_id = t.user_id
       AND ul.user_id IS DISTINCT FROM m.uid;
  END IF;

  IF to_regclass('public.xp_transactions') IS NOT NULL THEN
    DELETE FROM public.xp_transactions xt
     USING _targets t, _master_uid m
     WHERE xt.user_id = t.user_id
       AND xt.user_id IS DISTINCT FROM m.uid
       AND (
            lower(COALESCE(xt.action_type, '')) LIKE '%aura%'
         OR lower(COALESCE(xt.action_type, '')) LIKE '%match%'
         OR lower(COALESCE(xt.action_type, '')) LIKE '%conquista%'
         OR lower(COALESCE(xt.action_type, '')) LIKE '%achievement%'
         OR lower(COALESCE(xt.action_type, '')) LIKE '%mining%'
         OR lower(COALESCE(xt.action_type, '')) LIKE '%quest%'
         OR lower(COALESCE(xt.action_type, '')) LIKE '%chest%'
         OR lower(COALESCE(xt.description, '')) LIKE '%aura%'
         OR lower(COALESCE(xt.description, '')) LIKE '%match%'
         OR lower(COALESCE(xt.description, '')) LIKE '%conquista%'
         OR lower(COALESCE(xt.description, '')) LIKE '%achievement%'
         OR lower(COALESCE(xt.description, '')) LIKE '%mining%'
         OR lower(COALESCE(xt.description, '')) LIKE '%quest%'
         OR lower(COALESCE(xt.description, '')) LIKE '%chest%'
       );
  END IF;

  IF to_regclass('public.oculto_aura_xp_gifts') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_xp_gifts g
     USING public.profiles p, _targets t, _master_uid m
     WHERE (g.sender_id = p.id OR g.receiver_id = p.id)
       AND p.user_id = t.user_id
       AND p.user_id IS DISTINCT FROM m.uid;
  END IF;

  IF to_regclass('public.oculto_aura_xp_interaction_ledger') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_xp_interaction_ledger l
     USING public.profiles p, _targets t, _master_uid m
     WHERE (l.actor_id = p.id OR l.receiver_id = p.id)
       AND p.user_id = t.user_id
       AND p.user_id IS DISTINCT FROM m.uid;
  END IF;

  IF to_regclass('public.oculto_aura_daily_quests') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_daily_quests q USING _targets t, _master_uid m
     WHERE q.user_id = t.user_id AND q.user_id IS DISTINCT FROM m.uid;
  END IF;
  IF to_regclass('public.oculto_aura_visits') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_visits v USING _targets t, _master_uid m
     WHERE v.user_id = t.user_id AND v.user_id IS DISTINCT FROM m.uid;
  END IF;
  IF to_regclass('public.oculto_aura_streaks') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_streaks s USING _targets t, _master_uid m
     WHERE s.user_id = t.user_id AND s.user_id IS DISTINCT FROM m.uid;
  END IF;
  IF to_regclass('public.oculto_aura_weekly_chests') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_weekly_chests c USING _targets t, _master_uid m
     WHERE c.user_id = t.user_id AND c.user_id IS DISTINCT FROM m.uid;
  END IF;
  IF to_regclass('public.oculto_aura_boosts') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_boosts b USING _targets t, _master_uid m
     WHERE b.user_id = t.user_id AND b.user_id IS DISTINCT FROM m.uid;
  END IF;
  IF to_regclass('public.oculto_aura_pulses') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_pulses p USING _targets t, _master_uid m
     WHERE p.user_id = t.user_id AND p.user_id IS DISTINCT FROM m.uid;
  END IF;
  IF to_regclass('public.oculto_aura_attention') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_attention a USING _targets t, _master_uid m
     WHERE a.user_id = t.user_id AND a.user_id IS DISTINCT FROM m.uid;
  END IF;
  IF to_regclass('public.oculto_aura_room_actions') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_room_actions ra USING _targets t, _master_uid m
     WHERE ra.user_id = t.user_id AND ra.user_id IS DISTINCT FROM m.uid;
  END IF;
  IF to_regclass('public.oculto_aura_mining_log') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_mining_log ml USING _targets t, _master_uid m
     WHERE ml.user_id = t.user_id AND ml.user_id IS DISTINCT FROM m.uid;
  END IF;
  IF to_regclass('public.oculto_aura_duels') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_duels d
     USING _targets t, _master_uid m
     WHERE (d.challenger_id = t.user_id OR d.opponent_id = t.user_id)
       AND d.challenger_id IS DISTINCT FROM m.uid
       AND d.opponent_id IS DISTINCT FROM m.uid;
  END IF;
END $$;

UPDATE public.profiles p
   SET aura_xp = 0,
       aura_level = 1,
       aura_streak_days = 0,
       aura_last_seen_at = NULL
  FROM _targets t, _master_uid m
 WHERE p.user_id = t.user_id
   AND p.user_id IS DISTINCT FROM m.uid;

-- ---------------------------------------------------------------------
-- 7) Restaura snapshot seguro se houver; senão mantém zerado.
-- ---------------------------------------------------------------------
UPDATE public.profiles p
   SET aura_xp = GREATEST(0, COALESCE(s.aura_xp, 0)),
       aura_level = GREATEST(1, COALESCE(s.aura_level, 1)),
       aura_streak_days = GREATEST(0, COALESCE(s.aura_streak_days, 0))
  FROM _restore_snapshots s, _master_uid m
 WHERE p.user_id = s.user_id
   AND p.user_id IS DISTINCT FROM m.uid;

INSERT INTO _restored_users(user_id)
SELECT user_id FROM _restore_snapshots
ON CONFLICT DO NOTHING;

INSERT INTO public.oculto_aura_achievement_claims(user_id, profile_id, achievement_id, xp_awarded, claimed_at, applied_to_balance)
SELECT s.user_id,
       p.id,
       item->>'achievement_id',
       GREATEST(0, COALESCE(NULLIF(item->>'xp_awarded', '')::integer, 0)),
       COALESCE(NULLIF(item->>'claimed_at', '')::timestamptz, now()),
       true
  FROM _restore_snapshots s
  JOIN public.profiles p ON p.user_id = s.user_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.achievements, '[]'::jsonb)) AS item
 WHERE item ? 'achievement_id'
   AND COALESCE(item->>'achievement_id', '') <> ''
ON CONFLICT (user_id, achievement_id) DO NOTHING;

INSERT INTO public.oculto_aura_rare_unlocks(user_id, profile_id, achievement_id, achievement_title, xp_awarded, created_at)
SELECT s.user_id,
       p.id,
       item->>'achievement_id',
       COALESCE(item->>'achievement_title', item->>'title', item->>'achievement_id'),
       GREATEST(0, COALESCE(NULLIF(item->>'xp_awarded', '')::integer, 10000)),
       COALESCE(NULLIF(item->>'unlocked_at', '')::timestamptz, now())
  FROM _restore_snapshots s
  JOIN public.profiles p ON p.user_id = s.user_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.rare_unlocks, '[]'::jsonb)) AS item
 WHERE item ? 'achievement_id'
   AND COALESCE(item->>'achievement_id', '') <> ''
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- Fallback legado: se não havia snapshot diário seguro, restaura apenas XP
-- do audit antigo quando existir; conquistas permanecem zeradas.
DO $$
BEGIN
  IF to_regclass('public.oculto_aura_xp_repair_audit') IS NOT NULL THEN
    WITH last_snap AS (
      SELECT DISTINCT ON (a.user_id) a.user_id, a.original_xp
        FROM public.oculto_aura_xp_repair_audit a
        JOIN _targets t ON t.user_id = a.user_id
        LEFT JOIN _restored_users ru ON ru.user_id = a.user_id
       WHERE ru.user_id IS NULL
         AND a.original_xp IS NOT NULL
       ORDER BY a.user_id, a.created_at DESC NULLS LAST
    )
    UPDATE public.profiles p
       SET aura_xp = GREATEST(0, s.original_xp),
           aura_level = CASE
             WHEN to_regprocedure('public.aura_level_from_xp(integer)') IS NOT NULL
               THEN public.aura_level_from_xp(GREATEST(0, s.original_xp))
             WHEN to_regprocedure('public.aura_level_from_xp(int)') IS NOT NULL
               THEN public.aura_level_from_xp(GREATEST(0, s.original_xp))
             ELSE 1
           END,
           aura_streak_days = 0
      FROM last_snap s, _master_uid m
     WHERE p.user_id = s.user_id
       AND p.user_id IS DISTINCT FROM m.uid;
  END IF;
END $$;

-- Remove raras órfãs de qualquer usuário não-master após a limpeza.
DELETE FROM public.oculto_aura_rare_unlocks r
 USING _master_uid m
 WHERE r.user_id IS DISTINCT FROM m.uid
   AND NOT EXISTS (
     SELECT 1 FROM public.oculto_aura_achievement_claims c
      WHERE c.user_id = r.user_id
        AND c.achievement_id = r.achievement_id
   );

-- ---------------------------------------------------------------------
-- 8) Relatório final.
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT
  p.username,
  p.user_id,
  p.aura_xp,
  p.aura_level,
  p.aura_streak_days,
  COALESCE(c.claims_count, 0) AS aura_claims,
  COALESCE(r.rare_count, 0) AS rare_unlocks,
  t.reason AS reset_reason
FROM _targets t
JOIN public.profiles p ON p.user_id = t.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*)::int AS claims_count
    FROM public.oculto_aura_achievement_claims
   GROUP BY user_id
) c ON c.user_id = p.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*)::int AS rare_count
    FROM public.oculto_aura_rare_unlocks
   GROUP BY user_id
) r ON r.user_id = p.user_id
ORDER BY p.username;