-- =====================================================================
-- 2026_06_17_restore_aura_xp_levels_all_users.sql
-- Restaura XP/Nível de Aura por usuário após reset indevido e impede
-- mistura de valores entre perfis.
--
-- IMPORTANTE:
-- - Rodar no SQL Editor do Supabase EXTERNO.
-- - Idempotente: pode rodar mais de uma vez.
-- - Não usa Lovable Cloud interno.
-- - Reconstrói XP por fontes reais: ledgers, presentes, quests, cofres,
--   conquistas, mineração, sala ativa, duelos e pisos comprovados.
-- - Para usuários antigos, preserva o baseline legado de 1000 XP que existia
--   antes do reset. Usuários criados em/apos 2026-06-17 nao recebem baseline.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Helpers canônicos: nunca escolher perfil por user_id duplicado.
--    Regra: profiles.id primeiro; profiles.user_id somente se for único.
-- ---------------------------------------------------------------------
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

  SELECT p.id
    INTO v_profile_id
    FROM public.profiles p
   WHERE p.id = p_identity
   LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;
  END IF;

  SELECT p.id
    INTO v_profile_id
    FROM public.profiles p
   WHERE p.user_id = p_identity
     AND NOT EXISTS (
       SELECT 1
         FROM public.profiles p2
        WHERE p2.user_id = p_identity
          AND p2.id <> p.id
     )
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

CREATE OR REPLACE FUNCTION public.aura_min_xp_for_level(p_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (50 * GREATEST(COALESCE(p_level, 1) - 1, 0) * GREATEST(COALESCE(p_level, 1) - 1, 0))::integer;
$$;

GRANT EXECUTE ON FUNCTION public.aura_resolve_profile_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_current_profile_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_min_xp_for_level(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1) Auditoria da reparação — bloqueada para o cliente por RLS.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_aura_xp_repair_audit (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL,
  profile_id            uuid NOT NULL,
  profile_user_id        uuid,
  username              text,
  old_xp                integer,
  old_level             integer,
  restored_xp           integer,
  restored_level        integer,
  legacy_base_xp        bigint NOT NULL DEFAULT 0,
  interaction_net       bigint NOT NULL DEFAULT 0,
  gifts_net             bigint NOT NULL DEFAULT 0,
  daily_quests_xp       bigint NOT NULL DEFAULT 0,
  weekly_chests_xp      bigint NOT NULL DEFAULT 0,
  achievements_xp       bigint NOT NULL DEFAULT 0,
  mining_xp             bigint NOT NULL DEFAULT 0,
  active_room_xp        bigint NOT NULL DEFAULT 0,
  duels_xp              bigint NOT NULL DEFAULT 0,
  boosts_spent          bigint NOT NULL DEFAULT 0,
  user_levels_floor     bigint NOT NULL DEFAULT 0,
  xp_transactions_floor bigint NOT NULL DEFAULT 0,
  weekly_level_floor    bigint NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.oculto_aura_xp_repair_audit TO service_role;

ALTER TABLE public.oculto_aura_xp_repair_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_oculto_aura_xp_repair_audit_run
  ON public.oculto_aura_xp_repair_audit (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_xp_repair_audit_profile
  ON public.oculto_aura_xp_repair_audit (profile_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 2) Diagnóstico antes.
-- ---------------------------------------------------------------------
SELECT 'ANTES — usuários críticos' AS step,
       id, user_id, username, aura_xp, aura_level, created_at
  FROM public.profiles
 WHERE lower(coalesce(username, '')) IN ('oculto_master', 'ocultomaster', 'andarilha')
 ORDER BY username NULLS LAST, created_at ASC;

SELECT 'ANTES — top 20 por XP atual' AS step,
       id, user_id, username, aura_xp, aura_level, created_at
  FROM public.profiles
 ORDER BY COALESCE(aura_xp, 0) DESC, created_at ASC NULLS LAST
 LIMIT 20;

-- ---------------------------------------------------------------------
-- 3) Tabela temporária de reconstrução.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _aura_profile_repair (
  profile_id            uuid PRIMARY KEY,
  profile_user_id        uuid,
  username              text,
  created_at            timestamptz,
  current_xp            integer,
  current_level         integer,
  legacy_base_xp        bigint NOT NULL DEFAULT 0,
  interaction_net       bigint NOT NULL DEFAULT 0,
  gifts_net             bigint NOT NULL DEFAULT 0,
  daily_quests_xp       bigint NOT NULL DEFAULT 0,
  weekly_chests_xp      bigint NOT NULL DEFAULT 0,
  achievements_xp       bigint NOT NULL DEFAULT 0,
  mining_xp             bigint NOT NULL DEFAULT 0,
  active_room_xp        bigint NOT NULL DEFAULT 0,
  duels_xp              bigint NOT NULL DEFAULT 0,
  boosts_spent          bigint NOT NULL DEFAULT 0,
  user_levels_floor     bigint NOT NULL DEFAULT 0,
  xp_transactions_floor bigint NOT NULL DEFAULT 0,
  weekly_level_floor    bigint NOT NULL DEFAULT 0,
  computed_xp           bigint NOT NULL DEFAULT 0,
  proven_floor_xp       bigint NOT NULL DEFAULT 0,
  restored_xp           integer,
  restored_level        integer
) ON COMMIT DROP;

INSERT INTO _aura_profile_repair (
  profile_id, profile_user_id, username, created_at, current_xp, current_level, legacy_base_xp
)
SELECT p.id,
       p.user_id,
       p.username,
       p.created_at,
       COALESCE(p.aura_xp, 0),
       COALESCE(p.aura_level, 1),
       CASE
         WHEN p.created_at < TIMESTAMPTZ '2026-06-17 00:00:00-03' THEN 1000
         ELSE 0
       END::bigint AS legacy_base_xp
  FROM public.profiles p;

-- ---------------------------------------------------------------------
-- 4) Coleta dinâmica das fontes reais existentes.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  -- Ledger de interações do feed: recompensa recebida menos custo do ator.
  IF to_regclass('public.oculto_aura_xp_interaction_ledger') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT profile_id, SUM(amount)::bigint AS amount
          FROM (
            SELECT public.aura_resolve_profile_id(receiver_id) AS profile_id,
                   COALESCE(receiver_reward, 0)::bigint AS amount
              FROM public.oculto_aura_xp_interaction_ledger
             WHERE receiver_id IS NOT NULL
            UNION ALL
            SELECT public.aura_resolve_profile_id(actor_id) AS profile_id,
                   (-1 * COALESCE(actor_cost, 0))::bigint AS amount
              FROM public.oculto_aura_xp_interaction_ledger
             WHERE actor_id IS NOT NULL
          ) x
         WHERE profile_id IS NOT NULL
         GROUP BY profile_id
      )
      UPDATE _aura_profile_repair r
         SET interaction_net = COALESCE(src.amount, 0)
        FROM src
       WHERE r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- Presentes de Aura: entra no recebedor, sai do remetente.
  IF to_regclass('public.oculto_aura_xp_gifts') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT profile_id, SUM(amount)::bigint AS amount
          FROM (
            SELECT public.aura_resolve_profile_id(receiver_id) AS profile_id,
                   COALESCE(amount, 0)::bigint AS amount
              FROM public.oculto_aura_xp_gifts
             WHERE receiver_id IS NOT NULL
            UNION ALL
            SELECT public.aura_resolve_profile_id(sender_id) AS profile_id,
                   (-1 * COALESCE(amount, 0))::bigint AS amount
              FROM public.oculto_aura_xp_gifts
             WHERE sender_id IS NOT NULL
          ) x
         WHERE profile_id IS NOT NULL
         GROUP BY profile_id
      )
      UPDATE _aura_profile_repair r
         SET gifts_net = COALESCE(src.amount, 0)
        FROM src
       WHERE r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- Quests diárias reivindicadas.
  IF to_regclass('public.oculto_aura_daily_quests') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               SUM(COALESCE(xp_reward, 0))::bigint AS amount
          FROM public.oculto_aura_daily_quests
         WHERE claimed_at IS NOT NULL
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_profile_repair r
         SET daily_quests_xp = COALESCE(src.amount, 0)
        FROM src
       WHERE src.profile_id IS NOT NULL
         AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- Cofres semanais: XP concedido + piso comprovado pelo nível no momento do claim.
  -- O piso só vale para perfis antigos; isso evita perpetuar o bug visto na @andarilha.
  IF to_regclass('public.oculto_aura_weekly_chests') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               SUM(COALESCE(xp_awarded, 0))::bigint AS amount,
               MAX(public.aura_min_xp_for_level(level_at_claim))::bigint AS floor_amount
          FROM public.oculto_aura_weekly_chests
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_profile_repair r
         SET weekly_chests_xp = CASE
               WHEN r.created_at < TIMESTAMPTZ '2026-06-17 00:00:00-03'
               THEN COALESCE(src.amount, 0)
               ELSE 0
             END,
             weekly_level_floor = CASE
               WHEN r.created_at < TIMESTAMPTZ '2026-06-17 00:00:00-03'
               THEN COALESCE(src.floor_amount, 0)
               ELSE 0
             END
        FROM src
       WHERE src.profile_id IS NOT NULL
         AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- Conquistas reivindicadas.
  IF to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               SUM(COALESCE(xp_awarded, 0))::bigint AS amount
          FROM public.oculto_aura_achievement_claims
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_profile_repair r
         SET achievements_xp = COALESCE(src.amount, 0)
        FROM src
       WHERE src.profile_id IS NOT NULL
         AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- Mineração em salas.
  IF to_regclass('public.oculto_aura_room_mining_ledger') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               SUM(COALESCE(amount, 0))::bigint AS amount
          FROM public.oculto_aura_room_mining_ledger
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_profile_repair r
         SET mining_xp = COALESCE(src.amount, 0)
        FROM src
       WHERE src.profile_id IS NOT NULL
         AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- XP por permanência ativa em salas.
  IF to_regclass('public.oculto_aura_room_active_xp_log') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               SUM(COALESCE(amount, 0))::bigint AS amount
          FROM public.oculto_aura_room_active_xp_log
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_profile_repair r
         SET active_room_xp = COALESCE(src.amount, 0)
        FROM src
       WHERE src.profile_id IS NOT NULL
         AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- Duelos resolvidos: vencedor recebeu 100 XP.
  IF to_regclass('public.oculto_aura_duels') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(winner_id) AS profile_id,
               (COUNT(*) * 100)::bigint AS amount
          FROM public.oculto_aura_duels
         WHERE winner_id IS NOT NULL
           AND COALESCE(status, '') = 'resolved'
         GROUP BY public.aura_resolve_profile_id(winner_id)
      )
      UPDATE _aura_profile_repair r
         SET duels_xp = COALESCE(src.amount, 0)
        FROM src
       WHERE src.profile_id IS NOT NULL
         AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- Boosts: custo em XP.
  IF to_regclass('public.oculto_aura_boosts') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               SUM(COALESCE(xp_spent, 0))::bigint AS amount
          FROM public.oculto_aura_boosts
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_profile_repair r
         SET boosts_spent = COALESCE(src.amount, 0)
        FROM src
       WHERE src.profile_id IS NOT NULL
         AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- Tabela genérica user_levels: piso histórico comprovado.
  IF to_regclass('public.user_levels') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               MAX(GREATEST(COALESCE(total_xp, 0), public.aura_min_xp_for_level(COALESCE(current_level, 1))))::bigint AS floor_amount
          FROM public.user_levels
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_profile_repair r
         SET user_levels_floor = COALESCE(src.floor_amount, 0)
        FROM src
       WHERE src.profile_id IS NOT NULL
         AND r.profile_id = src.profile_id
    $sql$;
  END IF;

  -- xp_transactions: piso por soma histórica se existir.
  IF to_regclass('public.xp_transactions') IS NOT NULL THEN
    EXECUTE $sql$
      WITH src AS (
        SELECT public.aura_resolve_profile_id(user_id) AS profile_id,
               GREATEST(0, SUM(COALESCE(amount, 0)))::bigint AS floor_amount
          FROM public.xp_transactions
         GROUP BY public.aura_resolve_profile_id(user_id)
      )
      UPDATE _aura_profile_repair r
         SET xp_transactions_floor = COALESCE(src.floor_amount, 0)
        FROM src
       WHERE src.profile_id IS NOT NULL
         AND r.profile_id = src.profile_id
    $sql$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5) Cálculo final: soma real + maior piso histórico comprovado.
-- ---------------------------------------------------------------------
UPDATE _aura_profile_repair r
   SET computed_xp = GREATEST(
         0,
         COALESCE(legacy_base_xp, 0)
       + COALESCE(interaction_net, 0)
       + COALESCE(gifts_net, 0)
       + COALESCE(daily_quests_xp, 0)
       + COALESCE(weekly_chests_xp, 0)
       + COALESCE(achievements_xp, 0)
       + COALESCE(mining_xp, 0)
       + COALESCE(active_room_xp, 0)
       + COALESCE(duels_xp, 0)
       - COALESCE(boosts_spent, 0)
       ),
       proven_floor_xp = GREATEST(
         COALESCE(user_levels_floor, 0),
         COALESCE(xp_transactions_floor, 0),
         COALESCE(weekly_level_floor, 0),
         CASE
           WHEN lower(coalesce(username, '')) IN ('oculto_master', 'ocultomaster')
           THEN public.aura_min_xp_for_level(15)::bigint
           ELSE 0
         END
       );

UPDATE _aura_profile_repair r
   SET restored_xp = LEAST(2147483647, GREATEST(computed_xp, proven_floor_xp))::integer,
       restored_level = public.aura_level_from_xp(LEAST(2147483647, GREATEST(computed_xp, proven_floor_xp))::integer);

-- ---------------------------------------------------------------------
-- 6) Auditoria antes de alterar profiles.
-- ---------------------------------------------------------------------
INSERT INTO public.oculto_aura_xp_repair_audit (
  run_id, profile_id, profile_user_id, username,
  old_xp, old_level, restored_xp, restored_level,
  legacy_base_xp, interaction_net, gifts_net, daily_quests_xp,
  weekly_chests_xp, achievements_xp, mining_xp, active_room_xp,
  duels_xp, boosts_spent, user_levels_floor, xp_transactions_floor,
  weekly_level_floor
)
SELECT gen_random_uuid(), r.profile_id, r.profile_user_id, r.username,
       r.current_xp, r.current_level, r.restored_xp, r.restored_level,
       r.legacy_base_xp, r.interaction_net, r.gifts_net, r.daily_quests_xp,
       r.weekly_chests_xp, r.achievements_xp, r.mining_xp, r.active_room_xp,
       r.duels_xp, r.boosts_spent, r.user_levels_floor, r.xp_transactions_floor,
       r.weekly_level_floor
  FROM _aura_profile_repair r
 WHERE r.current_xp IS DISTINCT FROM r.restored_xp
    OR r.current_level IS DISTINCT FROM r.restored_level;

-- ---------------------------------------------------------------------
-- 7) Aplica restauração em todos os perfis, isolado por profiles.id.
-- ---------------------------------------------------------------------
UPDATE public.profiles p
   SET aura_xp = r.restored_xp,
       aura_level = r.restored_level
  FROM _aura_profile_repair r
 WHERE p.id = r.profile_id
   AND (
     p.aura_xp IS DISTINCT FROM r.restored_xp
     OR p.aura_level IS DISTINCT FROM r.restored_level
   );

-- Garante que novos perfis não herdem XP antigo.
ALTER TABLE public.profiles
  ALTER COLUMN aura_xp SET DEFAULT 0,
  ALTER COLUMN aura_level SET DEFAULT 1;

-- ---------------------------------------------------------------------
-- 8) Corrige funções centrais para não misturarem usuários no futuro.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_award_xp(p_amount integer, p_reason text DEFAULT NULL)
RETURNS TABLE(xp integer, level integer, level_up boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid := public.aura_current_profile_id();
  v_old_level int;
  v_new_xp int;
  v_new_level int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN RETURN; END IF;

  SELECT COALESCE(aura_level, 1)
    INTO v_old_level
    FROM public.profiles
   WHERE id = v_profile_id
   FOR UPDATE;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + p_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + p_amount))
   WHERE id = v_profile_id
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  xp := COALESCE(v_new_xp, 0);
  level := COALESCE(v_new_level, 1);
  level_up := COALESCE(v_new_level, 1) > COALESCE(v_old_level, 1);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_register_visit()
RETURNS TABLE(streak_days integer, xp integer, level integer, level_up boolean, awarded_xp integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid := public.aura_current_profile_id();
  v_last date;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_new_streak int;
  v_award int := 0;
  v_old_level int;
  v_new_xp int;
  v_new_level int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  SELECT (aura_last_seen_at at time zone 'America/Sao_Paulo')::date,
         COALESCE(aura_streak_days, 0),
         COALESCE(aura_level, 1)
    INTO v_last, v_new_streak, v_old_level
    FROM public.profiles
   WHERE id = v_profile_id
   FOR UPDATE;

  IF v_last IS NULL OR v_last < v_today - 1 THEN
    v_new_streak := 1;
    v_award := 10;
  ELSIF v_last = v_today - 1 THEN
    v_new_streak := v_new_streak + 1;
    v_award := 10 + LEAST(v_new_streak, 7) * 2;
  ELSE
    v_award := 0;
  END IF;

  UPDATE public.profiles
     SET aura_streak_days = v_new_streak,
         aura_last_seen_at = now(),
         aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_award),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_award))
   WHERE id = v_profile_id
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  streak_days := v_new_streak;
  xp := COALESCE(v_new_xp, 0);
  level := COALESCE(v_new_level, 1);
  level_up := COALESCE(v_new_level, 1) > COALESCE(v_old_level, 1);
  awarded_xp := v_award;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_get_progress()
RETURNS TABLE(xp integer, level integer, streak_days integer, xp_to_next integer, xp_in_level integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid := public.aura_current_profile_id();
  v_xp int;
  v_lvl int;
  v_streak int;
  v_floor int;
  v_next int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  SELECT COALESCE(aura_xp, 0), COALESCE(aura_level, 1), COALESCE(aura_streak_days, 0)
    INTO v_xp, v_lvl, v_streak
    FROM public.profiles
   WHERE id = v_profile_id;

  v_floor := 50 * (v_lvl - 1) * (v_lvl - 1);
  v_next  := 50 * v_lvl * v_lvl;

  xp := v_xp;
  level := v_lvl;
  streak_days := v_streak;
  xp_in_level := GREATEST(0, v_xp - v_floor);
  xp_to_next := GREATEST(1, v_next - v_floor);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_weekly_chest_status()
RETURNS TABLE(
  week_key text,
  claimed boolean,
  claimed_at timestamptz,
  next_claim_at timestamptz,
  level int,
  xp_preview int,
  super_dm_preview int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
  v_wk text := public.aura_current_week_key();
  v_row record;
  v_level int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  SELECT COALESCE(p.aura_level, 1)
    INTO v_level
    FROM public.profiles p
   WHERE p.id = v_profile_id;

  SELECT * INTO v_row
    FROM public.oculto_aura_weekly_chests
   WHERE user_id IN (v_uid, v_profile_id)
     AND week_key = v_wk
   ORDER BY claimed_at DESC
   LIMIT 1;

  week_key := v_wk;
  claimed := v_row.id IS NOT NULL;
  claimed_at := v_row.claimed_at;
  next_claim_at := CASE
    WHEN v_row.id IS NULL THEN now()
    ELSE date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::timestamptz + interval '7 days'
  END;
  level := COALESCE(v_level, 1);
  xp_preview := LEAST(500, 50 + (COALESCE(v_level, 1) - 1) * 25);
  super_dm_preview := CASE WHEN COALESCE(v_level, 1) >= 5 THEN 1 ELSE 0 END
                    + CASE WHEN COALESCE(v_level, 1) >= 10 THEN 1 ELSE 0 END
                    + CASE WHEN COALESCE(v_level, 1) >= 20 THEN 1 ELSE 0 END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_weekly_chest_claim()
RETURNS TABLE(ok boolean, message text, xp_awarded int, super_dm_awarded int, level int, level_up boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
  v_wk text := public.aura_current_week_key();
  v_level int;
  v_xp int;
  v_sdm int;
  v_old_level int;
  v_new_xp int;
  v_new_level int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_profile_id IS NULL THEN
    ok := false; message := 'Perfil não encontrado'; xp_awarded := 0; super_dm_awarded := 0; level := 1; level_up := false;
    RETURN NEXT; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.oculto_aura_weekly_chests
     WHERE user_id IN (v_uid, v_profile_id)
       AND week_key = v_wk
  ) THEN
    SELECT COALESCE(aura_level, 1) INTO v_level FROM public.profiles WHERE id = v_profile_id;
    ok := false; message := 'Cofre desta semana já foi reivindicado'; xp_awarded := 0; super_dm_awarded := 0;
    level := COALESCE(v_level, 1); level_up := false;
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(aura_level, 1)
    INTO v_level
    FROM public.profiles
   WHERE id = v_profile_id
   FOR UPDATE;

  v_old_level := COALESCE(v_level, 1);
  v_xp := LEAST(500, 50 + (v_old_level - 1) * 25);
  v_sdm := CASE WHEN v_old_level >= 5 THEN 1 ELSE 0 END
         + CASE WHEN v_old_level >= 10 THEN 1 ELSE 0 END
         + CASE WHEN v_old_level >= 20 THEN 1 ELSE 0 END;

  INSERT INTO public.oculto_aura_weekly_chests (user_id, week_key, level_at_claim, xp_awarded, super_dm_awarded)
  VALUES (v_uid, v_wk, v_old_level, v_xp, v_sdm);

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_xp))
   WHERE id = v_profile_id
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  ok := true;
  message := 'Cofre reivindicado!';
  xp_awarded := v_xp;
  super_dm_awarded := v_sdm;
  level := COALESCE(v_new_level, v_old_level);
  level_up := COALESCE(v_new_level, v_old_level) > v_old_level;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_weekly_chest_history(p_limit int DEFAULT 12)
RETURNS TABLE(week_key text, claimed_at timestamptz, level_at_claim int, xp_awarded int, super_dm_awarded int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
  v_lim int := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 52);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  SELECT c.week_key, c.claimed_at, c.level_at_claim, c.xp_awarded, c.super_dm_awarded
    FROM public.oculto_aura_weekly_chests c
   WHERE c.user_id IN (v_uid, v_profile_id)
   ORDER BY c.claimed_at DESC
   LIMIT v_lim;
END;
$$;

DROP FUNCTION IF EXISTS public.aura_send_xp_gift(uuid, integer);
DROP FUNCTION IF EXISTS public.aura_send_xp_gift(uuid, integer, uuid);

CREATE OR REPLACE FUNCTION public.aura_send_xp_gift(
  p_receiver_profile_id uuid,
  p_amount integer,
  p_post_id uuid DEFAULT NULL
)
RETURNS TABLE(success boolean, sender_xp integer, sender_level integer, receiver_xp integer, gift_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender_profile uuid := public.aura_current_profile_id();
  v_receiver_profile uuid;
  v_sender_xp integer;
  v_receiver_xp integer;
  v_new_sender_xp integer;
  v_new_sender_level integer;
  v_new_receiver_xp integer;
  v_gift_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_sender_profile IS NULL THEN RAISE EXCEPTION 'sender profile not found'; END IF;
  IF p_amount IS NULL OR p_amount < 5 OR p_amount > 500 THEN RAISE EXCEPTION 'amount must be between 5 and 500'; END IF;
  IF p_receiver_profile_id IS NULL THEN RAISE EXCEPTION 'receiver required'; END IF;

  v_receiver_profile := public.aura_resolve_profile_id(p_receiver_profile_id);
  IF v_receiver_profile IS NULL THEN RAISE EXCEPTION 'receiver not found'; END IF;
  IF v_receiver_profile = v_sender_profile THEN RAISE EXCEPTION 'cannot gift yourself'; END IF;

  SELECT COALESCE(aura_xp, 0) INTO v_sender_xp
    FROM public.profiles WHERE id = v_sender_profile FOR UPDATE;

  SELECT COALESCE(aura_xp, 0) INTO v_receiver_xp
    FROM public.profiles WHERE id = v_receiver_profile FOR UPDATE;

  IF v_sender_xp < p_amount THEN RAISE EXCEPTION 'insufficient xp'; END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) - p_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) - p_amount))
   WHERE id = v_sender_profile
   RETURNING aura_xp, aura_level INTO v_new_sender_xp, v_new_sender_level;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + p_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + p_amount))
   WHERE id = v_receiver_profile
   RETURNING aura_xp INTO v_new_receiver_xp;

  INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount, post_id)
  VALUES (v_sender_profile, v_receiver_profile, p_amount, p_post_id)
  RETURNING id INTO v_gift_id;

  RETURN QUERY SELECT true, v_new_sender_xp, v_new_sender_level, v_new_receiver_xp, v_gift_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_achievement_claim(
  p_achievement_id text,
  p_xp_reward integer
) RETURNS TABLE(awarded boolean, xp_total integer, level integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
  v_existing int;
  v_new_xp int;
  v_new_level int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p_achievement_id IS NULL OR length(trim(p_achievement_id)) = 0 THEN RAISE EXCEPTION 'achievement id required'; END IF;
  IF p_xp_reward IS NULL OR p_xp_reward <= 0 THEN RAISE EXCEPTION 'xp reward must be positive'; END IF;

  SELECT 1 INTO v_existing
    FROM public.oculto_aura_achievement_claims
   WHERE user_id = v_uid AND achievement_id = p_achievement_id;

  IF v_existing IS NOT NULL THEN
    SELECT aura_xp, aura_level INTO v_new_xp, v_new_level
      FROM public.profiles WHERE id = v_profile_id;
    awarded := false; xp_total := COALESCE(v_new_xp, 0); level := COALESCE(v_new_level, 1);
    RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.oculto_aura_achievement_claims (user_id, achievement_id, xp_awarded)
  VALUES (v_uid, p_achievement_id, p_xp_reward);

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + p_xp_reward),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + p_xp_reward))
   WHERE id = v_profile_id
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  awarded := true; xp_total := COALESCE(v_new_xp, 0); level := COALESCE(v_new_level, 1);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_xp_interaction_charge(
  p_action_key text,
  p_post_id uuid,
  p_receiver_id uuid,
  p_ref_key text
)
RETURNS TABLE(ok boolean, reason text, actor_cost int, receiver_reward int, actor_balance int, receiver_balance int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_pid uuid := public.aura_current_profile_id();
  v_receiver_pid uuid := public.aura_resolve_profile_id(p_receiver_id);
  v_cfg record;
  v_actor_xp int;
  v_receiver_xp int;
  v_already boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN QUERY SELECT false, 'auth_required', 0, 0, 0, 0; RETURN; END IF;
  IF v_actor_pid IS NULL THEN RETURN QUERY SELECT false, 'profile_missing', 0, 0, 0, 0; RETURN; END IF;

  SELECT * INTO v_cfg FROM public.oculto_aura_xp_interaction_costs WHERE action_key = p_action_key;
  IF NOT FOUND THEN
    RETURN QUERY SELECT true, 'no_config', 0, 0, COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_actor_pid), 0), 0;
    RETURN;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.oculto_aura_xp_interaction_ledger WHERE ref_key = p_ref_key) INTO v_already;
  IF v_already THEN
    RETURN QUERY SELECT true, 'already_charged', v_cfg.actor_cost, v_cfg.receiver_reward,
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_actor_pid), 0),
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_receiver_pid), 0);
    RETURN;
  END IF;

  IF NOT v_cfg.enabled THEN
    RETURN QUERY SELECT true, 'disabled', 0, 0,
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_actor_pid), 0),
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_receiver_pid), 0);
    RETURN;
  END IF;

  IF v_receiver_pid IS NOT NULL AND v_receiver_pid = v_actor_pid THEN
    RETURN QUERY SELECT true, 'self_action', 0, 0,
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_actor_pid), 0),
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_receiver_pid), 0);
    RETURN;
  END IF;

  SELECT COALESCE(aura_xp, 0) INTO v_actor_xp FROM public.profiles WHERE id = v_actor_pid FOR UPDATE;
  IF v_actor_xp < v_cfg.actor_cost THEN
    RETURN QUERY SELECT false, 'insufficient_xp', v_cfg.actor_cost, v_cfg.receiver_reward, v_actor_xp,
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_receiver_pid), 0);
    RETURN;
  END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) - v_cfg.actor_cost),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) - v_cfg.actor_cost))
   WHERE id = v_actor_pid
   RETURNING aura_xp INTO v_actor_xp;

  IF v_receiver_pid IS NOT NULL AND v_cfg.receiver_reward <> 0 THEN
    UPDATE public.profiles
       SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_cfg.receiver_reward),
           aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_cfg.receiver_reward))
     WHERE id = v_receiver_pid
     RETURNING aura_xp INTO v_receiver_xp;
  ELSE
    SELECT COALESCE(aura_xp, 0) INTO v_receiver_xp FROM public.profiles WHERE id = v_receiver_pid;
  END IF;

  INSERT INTO public.oculto_aura_xp_interaction_ledger
    (actor_id, receiver_id, action_key, actor_cost, receiver_reward, post_id, ref_key)
  VALUES (v_actor_pid, v_receiver_pid, p_action_key, v_cfg.actor_cost, v_cfg.receiver_reward, p_post_id, p_ref_key);

  RETURN QUERY SELECT true, 'ok', v_cfg.actor_cost, v_cfg.receiver_reward, COALESCE(v_actor_xp, 0), COALESCE(v_receiver_xp, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_room_award_active_xp(p_slug text)
RETURNS TABLE(ok boolean, reason text, new_xp integer, new_level smallint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
  v_last timestamptz;
  v_new_xp integer;
  v_new_level integer;
  v_amount integer := 10;
BEGIN
  IF v_uid IS NULL THEN RETURN QUERY SELECT false, 'auth_required'::text, 0, 0::smallint; RETURN; END IF;
  IF v_profile_id IS NULL THEN RETURN QUERY SELECT false, 'profile_missing'::text, 0, 0::smallint; RETURN; END IF;
  IF p_slug IS NULL OR length(btrim(p_slug)) = 0 THEN RETURN QUERY SELECT false, 'invalid_slug'::text, 0, 0::smallint; RETURN; END IF;

  SELECT MAX(awarded_at) INTO v_last
    FROM public.oculto_aura_room_active_xp_log
   WHERE user_id IN (v_uid, v_profile_id) AND slug = p_slug;

  IF v_last IS NOT NULL AND now() - v_last < interval '9 minutes' THEN
    RETURN QUERY SELECT false, 'cooldown'::text, 0, 0::smallint; RETURN;
  END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_amount))
   WHERE id = v_profile_id
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  INSERT INTO public.oculto_aura_room_active_xp_log(user_id, slug, amount)
  VALUES (v_uid, p_slug, v_amount);

  RETURN QUERY SELECT true, 'awarded'::text, COALESCE(v_new_xp, 0), COALESCE(v_new_level, 1)::smallint;
END;
$$;

CREATE OR REPLACE FUNCTION public._mining_credit_xp(
  p_user_id uuid,
  p_slug text,
  p_rule_key text,
  p_ref_key text,
  p_meta jsonb,
  p_message_id uuid DEFAULT NULL
) RETURNS TABLE(ok boolean, reason text, awarded integer, balance integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid := public.aura_resolve_profile_id(p_user_id);
  v_amount integer;
  v_enabled boolean;
  v_new_xp integer;
BEGIN
  SELECT r.amount, r.enabled INTO v_amount, v_enabled
    FROM public.oculto_aura_room_mining_rules r
   WHERE r.rule_key = p_rule_key;

  IF v_profile_id IS NULL THEN ok := false; reason := 'profile_missing'; awarded := 0; balance := 0; RETURN NEXT; RETURN; END IF;
  IF v_amount IS NULL THEN ok := false; reason := 'unknown_rule'; awarded := 0; balance := 0; RETURN NEXT; RETURN; END IF;
  IF v_enabled IS DISTINCT FROM true THEN ok := false; reason := 'disabled'; awarded := 0; balance := 0; RETURN NEXT; RETURN; END IF;

  BEGIN
    INSERT INTO public.oculto_aura_room_mining_ledger (user_id, slug, rule_key, amount, ref_key, meta, message_id)
    VALUES (p_user_id, p_slug, p_rule_key, v_amount, p_ref_key, p_meta, p_message_id);
  EXCEPTION WHEN unique_violation THEN
    SELECT COALESCE(aura_xp, 0) INTO balance FROM public.profiles WHERE id = v_profile_id;
    ok := false; reason := 'already_awarded'; awarded := 0;
    RETURN NEXT; RETURN;
  END;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_amount))
   WHERE id = v_profile_id
   RETURNING aura_xp INTO v_new_xp;

  ok := true; reason := 'credited'; awarded := v_amount; balance := COALESCE(v_new_xp, 0);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_boost_activate()
RETURNS TABLE(ok boolean, message text, expires_at timestamptz, xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
  v_xp int;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.oculto_aura_boosts WHERE user_id IN (v_uid, v_profile_id) AND expires_at > now()) THEN
    ok := false; message := 'Você já tem um boost ativo';
    SELECT ob.expires_at INTO expires_at FROM public.oculto_aura_boosts ob
     WHERE ob.user_id IN (v_uid, v_profile_id) AND ob.expires_at > now()
     ORDER BY ob.expires_at DESC LIMIT 1;
    SELECT aura_xp INTO xp FROM public.profiles WHERE id = v_profile_id;
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(aura_xp, 0) INTO v_xp FROM public.profiles WHERE id = v_profile_id FOR UPDATE;
  IF v_xp < 200 THEN ok := false; message := 'XP insuficiente (precisa de 200)'; expires_at := NULL; xp := v_xp; RETURN NEXT; RETURN; END IF;

  v_expires := now() + interval '60 minutes';

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) - 200),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) - 200))
   WHERE id = v_profile_id
   RETURNING aura_xp INTO v_xp;

  INSERT INTO public.oculto_aura_boosts (user_id, expires_at, xp_spent)
  VALUES (v_uid, v_expires, 200);

  ok := true; message := 'Boost ativado por 60 minutos'; expires_at := v_expires; xp := v_xp;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_boost_my_status()
RETURNS TABLE(active boolean, expires_at timestamptz, xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT ob.expires_at INTO expires_at FROM public.oculto_aura_boosts ob
   WHERE ob.user_id IN (v_uid, v_profile_id) AND ob.expires_at > now()
   ORDER BY ob.expires_at DESC LIMIT 1;
  active := expires_at IS NOT NULL;
  SELECT aura_xp INTO xp FROM public.profiles WHERE id = v_profile_id;
  xp := COALESCE(xp, 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_award_xp(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_register_visit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_get_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_claim() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_history(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_send_xp_gift(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_achievement_claim(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_charge(text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_room_award_active_xp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._mining_credit_xp(uuid, text, text, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_boost_activate() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_boost_my_status() TO authenticated;

-- ---------------------------------------------------------------------
-- 9) Diagnóstico final.
-- ---------------------------------------------------------------------
SELECT 'DEPOIS — usuários críticos' AS step,
       id, user_id, username, aura_xp, aura_level, created_at
  FROM public.profiles
 WHERE lower(coalesce(username, '')) IN ('oculto_master', 'ocultomaster', 'andarilha')
 ORDER BY username NULLS LAST, created_at ASC;

SELECT 'DEPOIS — top 30 por XP restaurado' AS step,
       id, user_id, username, aura_xp, aura_level, created_at
  FROM public.profiles
 ORDER BY COALESCE(aura_xp, 0) DESC, created_at ASC NULLS LAST
 LIMIT 30;

SELECT 'AUDITORIA — últimas alterações' AS step,
       username, old_xp, old_level, restored_xp, restored_level,
       legacy_base_xp, interaction_net, gifts_net, daily_quests_xp,
       weekly_chests_xp, achievements_xp, mining_xp, active_room_xp,
       duels_xp, boosts_spent, user_levels_floor, xp_transactions_floor,
       weekly_level_floor, created_at
  FROM public.oculto_aura_xp_repair_audit
 ORDER BY created_at DESC
 LIMIT 80;

NOTIFY pgrst, 'reload schema';

COMMIT;