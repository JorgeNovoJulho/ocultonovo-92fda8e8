-- =====================================================================
-- Etapa 44 — Oculto Play: Analytics de Retenção
-- Registra progresso periódico do viewer e expõe métricas por item.
-- Externo: rvybbrkzmboqbhcemqar
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_watch_progress (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  item_id           uuid NOT NULL,
  position_seconds  integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  duration_seconds  integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  watched_pct       numeric(5,2) NOT NULL DEFAULT 0 CHECK (watched_pct >= 0 AND watched_pct <= 100),
  completed         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_play_watch_progress_item   ON public.oculto_play_watch_progress (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_watch_progress_user   ON public.oculto_play_watch_progress (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_watch_progress_uitem  ON public.oculto_play_watch_progress (user_id, item_id, created_at DESC);

GRANT SELECT, INSERT ON public.oculto_play_watch_progress TO authenticated;
GRANT ALL ON public.oculto_play_watch_progress TO service_role;

ALTER TABLE public.oculto_play_watch_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_play_watch_progress' AND policyname='pwp_select_own') THEN
    CREATE POLICY pwp_select_own ON public.oculto_play_watch_progress
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_play_watch_progress' AND policyname='pwp_insert_own') THEN
    CREATE POLICY pwp_insert_own ON public.oculto_play_watch_progress
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- RPC de log (single source of truth do calculo de watched_pct/completed)
CREATE OR REPLACE FUNCTION public.oculto_play_log_progress(
  p_item_id          uuid,
  p_position_seconds integer,
  p_duration_seconds integer,
  p_completed        boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pct numeric(5,2);
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'item_id_required';
  END IF;

  v_pct := CASE
    WHEN COALESCE(p_duration_seconds, 0) > 0
      THEN LEAST(100, GREATEST(0, (p_position_seconds::numeric / p_duration_seconds::numeric) * 100))
    ELSE 0
  END;

  INSERT INTO public.oculto_play_watch_progress (
    user_id, item_id, position_seconds, duration_seconds, watched_pct, completed
  ) VALUES (
    v_uid,
    p_item_id,
    GREATEST(0, COALESCE(p_position_seconds, 0)),
    GREATEST(0, COALESCE(p_duration_seconds, 0)),
    v_pct,
    COALESCE(p_completed, false) OR v_pct >= 95
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_log_progress(uuid, integer, integer, boolean) TO authenticated;

-- RPC de retenção por item (somente dono do item)
CREATE OR REPLACE FUNCTION public.oculto_play_item_retention(p_item_id uuid)
RETURNS TABLE (
  viewers        bigint,
  total_samples  bigint,
  avg_watched_pct numeric,
  completion_rate numeric,
  last_sample_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- valida posse: o item está em posts.author_id?
  SELECT author_id INTO v_owner
  FROM public.posts
  WHERE id = p_item_id
  LIMIT 1;

  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH per_user AS (
    SELECT
      user_id,
      MAX(watched_pct) AS best_pct,
      BOOL_OR(completed) AS done,
      MAX(created_at) AS last_at
    FROM public.oculto_play_watch_progress
    WHERE item_id = p_item_id
    GROUP BY user_id
  )
  SELECT
    COUNT(*)::bigint                                    AS viewers,
    (SELECT COUNT(*) FROM public.oculto_play_watch_progress WHERE item_id = p_item_id)::bigint AS total_samples,
    COALESCE(ROUND(AVG(best_pct)::numeric, 2), 0)       AS avg_watched_pct,
    COALESCE(ROUND((SUM(CASE WHEN done THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100, 2), 0) AS completion_rate,
    MAX(last_at)                                        AS last_sample_at
  FROM per_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_item_retention(uuid) TO authenticated;
