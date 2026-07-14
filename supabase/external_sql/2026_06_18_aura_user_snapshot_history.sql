-- =====================================================================
-- Aura — Histórico diário (snapshot 24h) por usuário
-- Permite restauração para qualquer ponto anterior. Idempotente.
-- Cole INTEIRO no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Tabela de snapshots
CREATE TABLE IF NOT EXISTS public.oculto_aura_user_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  profile_id       uuid,
  username         text,
  aura_xp          integer NOT NULL DEFAULT 0,
  aura_level       integer NOT NULL DEFAULT 1,
  aura_streak_days integer NOT NULL DEFAULT 0,
  achievements     jsonb   NOT NULL DEFAULT '[]'::jsonb,
  rare_unlocks     jsonb   NOT NULL DEFAULT '[]'::jsonb,
  extra            jsonb   NOT NULL DEFAULT '{}'::jsonb,
  snapshot_date    date    NOT NULL DEFAULT ((now() at time zone 'America/Sao_Paulo')::date),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_user_snapshots_user_date
  ON public.oculto_aura_user_snapshots(user_id, snapshot_date DESC);

GRANT SELECT ON public.oculto_aura_user_snapshots TO authenticated;
GRANT ALL    ON public.oculto_aura_user_snapshots TO service_role;

ALTER TABLE public.oculto_aura_user_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own snapshots read" ON public.oculto_aura_user_snapshots;
CREATE POLICY "own snapshots read"
  ON public.oculto_aura_user_snapshots
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "service role all" ON public.oculto_aura_user_snapshots;
CREATE POLICY "service role all"
  ON public.oculto_aura_user_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2) Função que tira o snapshot do dia para TODOS os usuários
CREATE OR REPLACE FUNCTION public.aura_snapshot_all_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count integer := 0;
BEGIN
  WITH ach AS (
    SELECT user_id,
           COALESCE(jsonb_agg(jsonb_build_object(
             'achievement_id', achievement_id,
             'xp_awarded',     xp_awarded,
             'claimed_at',     claimed_at
           ) ORDER BY claimed_at), '[]'::jsonb) AS items
      FROM public.oculto_aura_achievement_claims
     GROUP BY user_id
  ),
  rare AS (
    SELECT user_id,
           COALESCE(jsonb_agg(jsonb_build_object(
             'achievement_id', achievement_id,
             'unlocked_at',    COALESCE(created_at, now())
           ) ORDER BY COALESCE(created_at, now())), '[]'::jsonb) AS items
      FROM public.oculto_aura_rare_unlocks
     GROUP BY user_id
  )
  INSERT INTO public.oculto_aura_user_snapshots
    (user_id, profile_id, username, aura_xp, aura_level, aura_streak_days,
     achievements, rare_unlocks, snapshot_date)
  SELECT p.user_id,
         p.id,
         p.username,
         COALESCE(p.aura_xp, 0),
         COALESCE(p.aura_level, 1),
         COALESCE(p.aura_streak_days, 0),
         COALESCE(a.items, '[]'::jsonb),
         COALESCE(r.items, '[]'::jsonb),
         v_today
    FROM public.profiles p
    LEFT JOIN ach  a ON a.user_id = p.user_id
    LEFT JOIN rare r ON r.user_id = p.user_id
   WHERE p.user_id IS NOT NULL
  ON CONFLICT (user_id, snapshot_date) DO UPDATE
    SET aura_xp          = EXCLUDED.aura_xp,
        aura_level       = EXCLUDED.aura_level,
        aura_streak_days = EXCLUDED.aura_streak_days,
        achievements     = EXCLUDED.achievements,
        rare_unlocks     = EXCLUDED.rare_unlocks,
        profile_id       = EXCLUDED.profile_id,
        username         = EXCLUDED.username;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_snapshot_all_users() TO service_role;

-- 3) Função de restauração (admin / service_role)
CREATE OR REPLACE FUNCTION public.aura_restore_user_from_snapshot(
  p_user_id uuid,
  p_snapshot_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap public.oculto_aura_user_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_snap
    FROM public.oculto_aura_user_snapshots
   WHERE user_id = p_user_id
     AND (p_snapshot_date IS NULL OR snapshot_date <= p_snapshot_date)
   ORDER BY snapshot_date DESC
   LIMIT 1;

  IF v_snap.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_snapshot');
  END IF;

  UPDATE public.profiles
     SET aura_xp          = v_snap.aura_xp,
         aura_level       = v_snap.aura_level,
         aura_streak_days = v_snap.aura_streak_days
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot_date', v_snap.snapshot_date,
    'aura_xp', v_snap.aura_xp,
    'aura_level', v_snap.aura_level,
    'aura_streak_days', v_snap.aura_streak_days,
    'achievements_count', jsonb_array_length(v_snap.achievements),
    'rare_unlocks_count', jsonb_array_length(v_snap.rare_unlocks)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_restore_user_from_snapshot(uuid, date) TO service_role;

-- 4) Snapshot inicial AGORA (preenche o histórico do dia)
SELECT public.aura_snapshot_all_users() AS snapshots_created;

-- 5) Agendamento a cada 24h (03:00 BRT = 06:00 UTC) via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('aura_user_snapshot_daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'aura_user_snapshot_daily',
  '0 6 * * *',
  $cron$ SELECT public.aura_snapshot_all_users(); $cron$
);

NOTIFY pgrst, 'reload schema';
