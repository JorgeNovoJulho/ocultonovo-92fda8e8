-- =====================================================================
-- 2026_06_17_fix_per_user_aura_xp_isolation.sql
-- Garante que cada usuário tenha XP/level/conquistas reais e isolados.
-- Recalcula aura_xp a partir do ledger autoritativo + presentes,
-- atualiza aura_level e remove conquistas reivindicadas inconsistentes.
-- Idempotente — pode rodar várias vezes.
-- =====================================================================

-- 1) DIAGNÓSTICO inicial
SELECT 'ANTES — andarilha' AS step, id, user_id, username, aura_xp, aura_level, created_at
  FROM public.profiles
 WHERE username ILIKE 'andarilh%'
 LIMIT 5;

SELECT 'ANTES — últimos 10' AS step, id, username, aura_xp, aura_level, created_at
  FROM public.profiles
 ORDER BY created_at DESC
 LIMIT 10;

-- 2) DEFAULT 0 em aura_xp (evita novos perfis com valor herdado)
ALTER TABLE public.profiles
  ALTER COLUMN aura_xp SET DEFAULT 0;

-- 3) Recalcula aura_xp REAL por usuário (ledger + presentes in/out)
WITH ledger_sum AS (
  SELECT receiver_id AS profile_id,
         COALESCE(SUM(receiver_reward), 0)::bigint AS xp_from_ledger
    FROM public.oculto_aura_xp_interaction_ledger
   GROUP BY receiver_id
),
gifts_in AS (
  SELECT receiver_id AS profile_id,
         COALESCE(SUM(amount), 0)::bigint AS xp_in
    FROM public.oculto_aura_xp_gifts
   GROUP BY receiver_id
),
gifts_out AS (
  SELECT sender_id AS profile_id,
         COALESCE(SUM(amount), 0)::bigint AS xp_out
    FROM public.oculto_aura_xp_gifts
   GROUP BY sender_id
),
computed AS (
  SELECT p.id AS profile_id,
         GREATEST(
           0,
           COALESCE(ls.xp_from_ledger, 0)
           + COALESCE(gi.xp_in,  0)
           - COALESCE(go.xp_out, 0)
         )::bigint AS real_xp
    FROM public.profiles p
    LEFT JOIN ledger_sum ls ON ls.profile_id = p.id
    LEFT JOIN gifts_in   gi ON gi.profile_id = p.id
    LEFT JOIN gifts_out  go ON go.profile_id = p.id
)
UPDATE public.profiles p
   SET aura_xp    = c.real_xp,
       aura_level = public.aura_level_from_xp(c.real_xp::int)
  FROM computed c
 WHERE p.id = c.profile_id
   AND (p.aura_xp IS DISTINCT FROM c.real_xp);

-- 4) Remove conquistas reivindicadas inconsistentes (perfis zerados)
DO $$
BEGIN
  IF to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL THEN
    EXECUTE '
      DELETE FROM public.oculto_aura_achievement_claims c
       USING public.profiles p
       WHERE p.user_id = c.user_id
         AND p.aura_xp = 0
    ';
  END IF;
END $$;

-- 5) DIAGNÓSTICO final
SELECT 'DEPOIS — andarilha' AS step, id, user_id, username, aura_xp, aura_level
  FROM public.profiles
 WHERE username ILIKE 'andarilh%'
 LIMIT 5;

SELECT 'DEPOIS — últimos 10' AS step, id, username, aura_xp, aura_level, created_at
  FROM public.profiles
 ORDER BY created_at DESC
 LIMIT 10;
