-- =====================================================================
-- 2026_06_17_restore_aura_levels_non_destructive.sql
-- Recuperação NÃO DESTRUTIVA dos níveis/XP de Aura.
--
-- Objetivo:
-- - Restaurar usuários afetados por reset/baixa indevida usando o MAIOR
--   valor histórico confiável disponível.
-- - Nunca reduzir aura_xp/aura_level atuais.
-- - Isolar por profiles.id canônico; user_id só entra como fallback seguro.
-- - Preservar @andarilha em seu nível real, sem herdar cofre contaminado.
--
-- Rodar no SQL Editor do Supabase EXTERNO.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.aura_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(COALESCE(p_xp, 0), 0)::numeric / 50))::int + 1);
$$;

CREATE OR REPLACE FUNCTION public.aura_min_xp_for_level(p_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (50 * GREATEST(COALESCE(p_level, 1) - 1, 0) * GREATEST(COALESCE(p_level, 1) - 1, 0))::integer;
$$;

CREATE OR REPLACE FUNCTION public.aura_resolve_profile_id(p_identity uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_identity IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.id INTO v_profile_id
    FROM public.profiles p
   WHERE p.id = p_identity
   LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;
  END IF;

  SELECT p.id INTO v_profile_id
    FROM public.profiles p
   WHERE p.user_id = p_identity
   ORDER BY p.created_at ASC NULLS LAST
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

GRANT EXECUTE ON FUNCTION public.aura_level_from_xp(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_min_xp_for_level(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_resolve_profile_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_current_profile_id() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.oculto_aura_xp_restore_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  username text,
  old_xp integer,
  old_level integer,
  new_xp integer,
  new_level integer,
  chosen_floor bigint NOT NULL DEFAULT 0,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.oculto_aura_xp_restore_audit TO service_role;
ALTER TABLE public.oculto_aura_xp_restore_audit ENABLE ROW LEVEL SECURITY;

SELECT 'ANTES — usuários críticos' AS step, id, user_id, username, aura_xp, aura_level, created_at
  FROM public.profiles
 WHERE lower(coalesce(username, '')) IN ('ocultomaster', 'oculto_master', 'andarilha')
 ORDER BY username NULLS LAST, created_at ASC;

CREATE TEMP TABLE _aura_restore_candidates (
  profile_id uuid PRIMARY KEY,
  username text,
  current_xp bigint NOT NULL DEFAULT 0,
  current_level int NOT NULL DEFAULT 1,
  max_audit_xp bigint NOT NULL DEFAULT 0,
  user_levels_xp bigint NOT NULL DEFAULT 0,
  xp_transactions_xp bigint NOT NULL DEFAULT 0,
  ledger_xp bigint NOT NULL DEFAULT 0,
  gifts_net_xp bigint NOT NULL DEFAULT 0,
  quests_xp bigint NOT NULL DEFAULT 0,
  chests_xp bigint NOT NULL DEFAULT 0,
  chests_level_floor bigint NOT NULL DEFAULT 0,
  achievements_xp bigint NOT NULL DEFAULT 0,
  mining_xp bigint NOT NULL DEFAULT 0,
  active_room_xp bigint NOT NULL DEFAULT 0,
  duels_xp bigint NOT NULL DEFAULT 0,
  boost_spent_xp bigint NOT NULL DEFAULT 0,
  manual_floor_xp bigint NOT NULL DEFAULT 0,
  chosen_xp bigint NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'current'
) ON COMMIT DROP;

INSERT INTO _aura_restore_candidates (profile_id, username, current_xp, current_level, manual_floor_xp)
SELECT p.id,
       p.username,
       GREATEST(COALESCE(p.aura_xp, 0), public.aura_min_xp_for_level(COALESCE(p.aura_level, 1)))::bigint,
       COALESCE(p.aura_level, 1),
       CASE WHEN lower(coalesce(p.username, '')) IN ('ocultomaster', 'oculto_master')
            THEN 9800 ELSE 0 END::bigint
  FROM public.profiles p;

DO $$
BEGIN
  IF to_regclass('public.oculto_aura_xp_repair_audit') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT profile_id,
               MAX(GREATEST(COALESCE(old_xp, 0), COALESCE(restored_xp, 0), public.aura_min_xp_for_level(COALESCE(old_level, 1)), public.aura_min_xp_for_level(COALESCE(restored_level, 1))))::bigint AS xp
          FROM public.oculto_aura_xp_repair_audit
         GROUP BY profile_id
      )
      UPDATE _aura_restore_candidates r SET max_audit_xp = src.xp
        FROM src WHERE r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.user_levels') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               MAX(GREATEST(COALESCE(total_xp, 0), COALESCE(current_xp, 0), public.aura_min_xp_for_level(COALESCE(current_level, 1))))::bigint AS xp
          FROM public.user_levels
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_restore_candidates r SET user_levels_xp = src.xp
        FROM src WHERE src.profile_id IS NOT NULL AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.xp_transactions') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               GREATEST(0, SUM(COALESCE(amount, 0)))::bigint AS xp
          FROM public.xp_transactions
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_restore_candidates r SET xp_transactions_xp = src.xp
        FROM src WHERE src.profile_id IS NOT NULL AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.oculto_aura_xp_interaction_ledger') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT profile_id, GREATEST(0, SUM(amount))::bigint AS xp
          FROM (
            SELECT public.aura_resolve_profile_id(receiver_id) AS profile_id, COALESCE(receiver_reward, 0)::bigint AS amount FROM public.oculto_aura_xp_interaction_ledger
            UNION ALL
            SELECT public.aura_resolve_profile_id(actor_id) AS profile_id, (-1 * COALESCE(actor_cost, 0))::bigint AS amount FROM public.oculto_aura_xp_interaction_ledger
          ) x WHERE profile_id IS NOT NULL GROUP BY profile_id
      )
      UPDATE _aura_restore_candidates r SET ledger_xp = src.xp
        FROM src WHERE r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.oculto_aura_xp_gifts') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT profile_id, GREATEST(0, SUM(amount))::bigint AS xp
          FROM (
            SELECT public.aura_resolve_profile_id(receiver_id) AS profile_id, COALESCE(amount, 0)::bigint AS amount FROM public.oculto_aura_xp_gifts
            UNION ALL
            SELECT public.aura_resolve_profile_id(sender_id) AS profile_id, (-1 * COALESCE(amount, 0))::bigint AS amount FROM public.oculto_aura_xp_gifts
          ) x WHERE profile_id IS NOT NULL GROUP BY profile_id
      )
      UPDATE _aura_restore_candidates r SET gifts_net_xp = src.xp
        FROM src WHERE r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.oculto_aura_daily_quests') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id, SUM(COALESCE(xp_reward, 0))::bigint AS xp
          FROM public.oculto_aura_daily_quests WHERE claimed_at IS NOT NULL
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_restore_candidates r SET quests_xp = src.xp
        FROM src WHERE src.profile_id IS NOT NULL AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.oculto_aura_weekly_chests') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               SUM(COALESCE(xp_awarded, 0))::bigint AS xp,
               MAX(public.aura_min_xp_for_level(COALESCE(level_at_claim, 1)))::bigint AS floor_xp
          FROM public.oculto_aura_weekly_chests
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_restore_candidates r
         SET chests_xp = src.xp,
             chests_level_floor = CASE WHEN lower(coalesce(r.username, '')) = 'andarilha' THEN 0 ELSE src.floor_xp END
        FROM src WHERE src.profile_id IS NOT NULL AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id, SUM(COALESCE(xp_awarded, 0))::bigint AS xp
          FROM public.oculto_aura_achievement_claims
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_restore_candidates r SET achievements_xp = src.xp
        FROM src WHERE src.profile_id IS NOT NULL AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.oculto_aura_room_mining_ledger') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id, SUM(COALESCE(amount, 0))::bigint AS xp
          FROM public.oculto_aura_room_mining_ledger
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_restore_candidates r SET mining_xp = src.xp
        FROM src WHERE src.profile_id IS NOT NULL AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.oculto_aura_room_active_xp_log') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id, SUM(COALESCE(amount, 0))::bigint AS xp
          FROM public.oculto_aura_room_active_xp_log
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_restore_candidates r SET active_room_xp = src.xp
        FROM src WHERE src.profile_id IS NOT NULL AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.oculto_aura_duels') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(winner_id) AS profile_id, (COUNT(*) * 100)::bigint AS xp
          FROM public.oculto_aura_duels WHERE winner_id IS NOT NULL AND COALESCE(status, '') = 'resolved'
         GROUP BY public.aura_resolve_profile_id(winner_id)
      )
      UPDATE _aura_restore_candidates r SET duels_xp = src.xp
        FROM src WHERE src.profile_id IS NOT NULL AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  IF to_regclass('public.oculto_aura_boosts') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id, SUM(COALESCE(xp_spent, 0))::bigint AS xp
          FROM public.oculto_aura_boosts
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_restore_candidates r SET boost_spent_xp = src.xp
        FROM src WHERE src.profile_id IS NOT NULL AND r.profile_id = src.profile_id
    $sql$;
  END IF;
END $$;

UPDATE _aura_restore_candidates r
   SET chosen_xp = GREATEST(
         current_xp,
         max_audit_xp,
         user_levels_xp,
         xp_transactions_xp,
         chests_level_floor,
         manual_floor_xp,
         GREATEST(0, ledger_xp + gifts_net_xp + quests_xp + chests_xp + achievements_xp + mining_xp + active_room_xp + duels_xp - boost_spent_xp)
       ),
       source = CASE GREATEST(
         current_xp, max_audit_xp, user_levels_xp, xp_transactions_xp, chests_level_floor, manual_floor_xp,
         GREATEST(0, ledger_xp + gifts_net_xp + quests_xp + chests_xp + achievements_xp + mining_xp + active_room_xp + duels_xp - boost_spent_xp)
       )
         WHEN manual_floor_xp THEN 'manual_floor_master'
         WHEN max_audit_xp THEN 'repair_audit'
         WHEN user_levels_xp THEN 'user_levels'
         WHEN xp_transactions_xp THEN 'xp_transactions'
         WHEN chests_level_floor THEN 'weekly_chest_level_floor'
         ELSE 'computed_or_current'
       END;

INSERT INTO public.oculto_aura_xp_restore_audit (profile_id, username, old_xp, old_level, new_xp, new_level, chosen_floor, source)
SELECT p.id, p.username, COALESCE(p.aura_xp, 0), COALESCE(p.aura_level, 1),
       LEAST(2147483647, r.chosen_xp)::integer,
       public.aura_level_from_xp(LEAST(2147483647, r.chosen_xp)::integer),
       r.chosen_xp,
       r.source
  FROM public.profiles p
  JOIN _aura_restore_candidates r ON r.profile_id = p.id
 WHERE r.chosen_xp > GREATEST(COALESCE(p.aura_xp, 0), public.aura_min_xp_for_level(COALESCE(p.aura_level, 1)));

UPDATE public.profiles p
   SET aura_xp = LEAST(2147483647, r.chosen_xp)::integer,
       aura_level = public.aura_level_from_xp(LEAST(2147483647, r.chosen_xp)::integer)
  FROM _aura_restore_candidates r
 WHERE p.id = r.profile_id
   AND r.chosen_xp > GREATEST(COALESCE(p.aura_xp, 0), public.aura_min_xp_for_level(COALESCE(p.aura_level, 1)));

ALTER TABLE public.profiles
  ALTER COLUMN aura_xp SET DEFAULT 0,
  ALTER COLUMN aura_level SET DEFAULT 1;

-- Cofre semanal: sempre lê/escreve pelo profile.id canônico, não por linhas duplicadas.
CREATE OR REPLACE FUNCTION public.aura_weekly_chest_status()
RETURNS TABLE(week_key text, claimed boolean, claimed_at timestamptz, next_claim_at timestamptz, level int, xp_preview int, super_dm_preview int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid := public.aura_current_profile_id();
  v_wk text := public.aura_current_week_key();
  v_row record;
  v_level int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  SELECT COALESCE(p.aura_level, 1) INTO v_level FROM public.profiles p WHERE p.id = v_profile_id;
  SELECT c.* INTO v_row FROM public.oculto_aura_weekly_chests c
   WHERE c.week_key = v_wk AND public.aura_resolve_profile_id(c.user_id) = v_profile_id
   ORDER BY c.claimed_at DESC LIMIT 1;

  week_key := v_wk;
  claimed := v_row.id IS NOT NULL;
  claimed_at := v_row.claimed_at;
  next_claim_at := CASE WHEN v_row.id IS NULL THEN now() ELSE date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::timestamptz + interval '7 days' END;
  level := COALESCE(v_level, 1);
  xp_preview := LEAST(500, 50 + (COALESCE(v_level, 1) - 1) * 25);
  super_dm_preview := CASE WHEN COALESCE(v_level, 1) >= 5 THEN 1 ELSE 0 END + CASE WHEN COALESCE(v_level, 1) >= 10 THEN 1 ELSE 0 END + CASE WHEN COALESCE(v_level, 1) >= 20 THEN 1 ELSE 0 END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_weekly_chest_history(p_limit int DEFAULT 12)
RETURNS TABLE(week_key text, claimed_at timestamptz, level_at_claim int, xp_awarded int, super_dm_awarded int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid := public.aura_current_profile_id();
  v_lim int := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 52);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  RETURN QUERY
  SELECT c.week_key, c.claimed_at, c.level_at_claim, c.xp_awarded, c.super_dm_awarded
    FROM public.oculto_aura_weekly_chests c
   WHERE public.aura_resolve_profile_id(c.user_id) = v_profile_id
   ORDER BY c.claimed_at DESC LIMIT v_lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_history(int) TO authenticated;

SELECT 'DEPOIS — usuários críticos' AS step, id, user_id, username, aura_xp, aura_level, created_at
  FROM public.profiles
 WHERE lower(coalesce(username, '')) IN ('ocultomaster', 'oculto_master', 'andarilha')
 ORDER BY username NULLS LAST, created_at ASC;

SELECT 'RESTAURADOS NESTA EXECUÇÃO' AS step, username, old_xp, old_level, new_xp, new_level, source, created_at
  FROM public.oculto_aura_xp_restore_audit
 ORDER BY created_at DESC
 LIMIT 50;

NOTIFY pgrst, 'reload schema';

COMMIT;