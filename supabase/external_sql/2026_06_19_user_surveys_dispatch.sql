-- =========================================================================
-- 2026-06-19 — Disparo retroativo da Pesquisa OCULTO para a base existente
-- Idempotente. Roda no SQL Editor do Supabase EXTERNO.
--
-- Adiciona:
--   * Colunas de rastreio em oculto_user_surveys
--   * Colunas de filtro/contadores em oculto_user_survey_campaigns
--   * RPC public.oculto_dispatch_survey_batch(filter, dry_run, max, threshold_days)
--     que cria pending surveys respeitando:
--       - NÃO reenvia para quem já respondeu (completed/skipped)
--       - NÃO reenvia para quem está em andamento (in_progress)
--       - NÃO reenvia para quem recebeu há menos de N dias (default 7)
-- =========================================================================

-- 1) Colunas de rastreio em oculto_user_surveys
ALTER TABLE public.oculto_user_surveys
  ADD COLUMN IF NOT EXISTS dispatched_via_campaign_id uuid,
  ADD COLUMN IF NOT EXISTS dispatched_by              uuid,
  ADD COLUMN IF NOT EXISTS notified_at                timestamptz;

CREATE INDEX IF NOT EXISTS idx_oculto_user_surveys_campaign
  ON public.oculto_user_surveys (dispatched_via_campaign_id);
CREATE INDEX IF NOT EXISTS idx_oculto_user_surveys_notified_at
  ON public.oculto_user_surveys (notified_at DESC);

-- 2) Colunas de filtro/contadores em oculto_user_survey_campaigns
ALTER TABLE public.oculto_user_survey_campaigns
  ADD COLUMN IF NOT EXISTS target_filter              text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS dry_run                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_threshold_days      int  NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS total_eligible             int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_skipped_completed    int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_skipped_in_progress  int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_skipped_recent       int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finished_at                timestamptz,
  ADD COLUMN IF NOT EXISTS notes                      text;

-- Garante CHECK para target_filter (recria se necessário)
DO $$ BEGIN
  ALTER TABLE public.oculto_user_survey_campaigns
    DROP CONSTRAINT IF EXISTS oculto_user_survey_campaigns_target_filter_check;
  ALTER TABLE public.oculto_user_survey_campaigns
    ADD CONSTRAINT oculto_user_survey_campaigns_target_filter_check
    CHECK (target_filter IN ('all','active','inactive','premium','vip','creators'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3) RPC de disparo em lote
CREATE OR REPLACE FUNCTION public.oculto_dispatch_survey_batch(
  p_filter          text    DEFAULT 'all',
  p_dry_run         boolean DEFAULT false,
  p_max             int     DEFAULT 1000,
  p_threshold_days  int     DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id          uuid;
  v_now                  timestamptz := now();
  v_filter               text := lower(coalesce(p_filter,'all'));
  v_threshold            int  := greatest(1, coalesce(p_threshold_days, 7));
  v_max                  int  := greatest(1, least(coalesce(p_max, 1000), 10000));
  v_eligible             int  := 0;
  v_skipped_completed    int  := 0;
  v_skipped_in_progress  int  := 0;
  v_skipped_recent       int  := 0;
  v_dispatched           int  := 0;
BEGIN
  -- Permissão master
  IF NOT public.is_admin_master() THEN
    RAISE EXCEPTION 'forbidden: master only';
  END IF;

  IF v_filter NOT IN ('all','active','inactive','premium','vip','creators') THEN
    RAISE EXCEPTION 'invalid filter: %', v_filter;
  END IF;

  -- Cria campanha (log obrigatório)
  INSERT INTO public.oculto_user_survey_campaigns
    (created_by, target_type, target_filter, status,
     dry_run, notify_threshold_days)
  VALUES
    (auth.uid(), 'all', v_filter,
     CASE WHEN p_dry_run THEN 'draft' ELSE 'active' END,
     p_dry_run, v_threshold)
  RETURNING id INTO v_campaign_id;

  -- Candidatos por filtro + última pesquisa
  CREATE TEMP TABLE _survey_cand ON COMMIT DROP AS
  WITH base AS (
    SELECT p.user_id, p.plan_type, p.is_creator, p.last_seen
    FROM public.profiles p
    WHERE p.user_id IS NOT NULL
      AND coalesce(p.is_seed, false) = false
      AND (
        v_filter = 'all'
        OR (v_filter = 'active'   AND p.last_seen IS NOT NULL AND p.last_seen >  v_now - interval '30 days')
        OR (v_filter = 'inactive' AND (p.last_seen IS NULL OR p.last_seen <= v_now - interval '30 days'))
        OR (v_filter = 'premium'  AND p.plan_type IN ('premium','monthly'))
        OR (v_filter = 'vip'      AND p.plan_type = 'vip')
        OR (v_filter = 'creators' AND coalesce(p.is_creator,false) = true)
      )
  )
  SELECT b.user_id,
    (SELECT s.status
       FROM public.oculto_user_surveys s
      WHERE s.user_id = b.user_id
      ORDER BY s.created_at DESC LIMIT 1) AS last_status,
    (SELECT s.created_at
       FROM public.oculto_user_surveys s
      WHERE s.user_id = b.user_id
      ORDER BY s.created_at DESC LIMIT 1) AS last_created
  FROM base b;

  v_eligible            := (SELECT count(*) FROM _survey_cand);
  v_skipped_completed   := (SELECT count(*) FROM _survey_cand
                            WHERE last_status IN ('completed','skipped'));
  v_skipped_in_progress := (SELECT count(*) FROM _survey_cand
                            WHERE last_status = 'in_progress');
  v_skipped_recent      := (SELECT count(*) FROM _survey_cand
                            WHERE last_status = 'pending'
                              AND last_created IS NOT NULL
                              AND last_created > v_now - make_interval(days => v_threshold));

  -- Dry-run: só conta, não insere
  IF p_dry_run THEN
    UPDATE public.oculto_user_survey_campaigns SET
      total_eligible            = v_eligible,
      total_skipped_completed   = v_skipped_completed,
      total_skipped_in_progress = v_skipped_in_progress,
      total_skipped_recent      = v_skipped_recent,
      total_sent                = 0,
      status                    = 'draft',
      finished_at               = now()
    WHERE id = v_campaign_id;

    RETURN jsonb_build_object(
      'campaign_id',          v_campaign_id,
      'dry_run',              true,
      'filter',               v_filter,
      'threshold_days',       v_threshold,
      'eligible',             v_eligible,
      'will_dispatch',        greatest(0, v_eligible - v_skipped_completed - v_skipped_in_progress - v_skipped_recent),
      'skipped_completed',    v_skipped_completed,
      'skipped_in_progress',  v_skipped_in_progress,
      'skipped_recent',       v_skipped_recent
    );
  END IF;

  -- Disparo real: insere pending para quem nunca recebeu OU
  -- recebeu há mais de N dias e ainda está pending (re-disparo periódico).
  WITH inserted AS (
    INSERT INTO public.oculto_user_surveys
      (user_id, status, dispatched_via_campaign_id, dispatched_by, notified_at)
    SELECT c.user_id, 'pending', v_campaign_id, auth.uid(), v_now
      FROM _survey_cand c
     WHERE c.last_status IS NULL
        OR (c.last_status = 'pending'
            AND (c.last_created IS NULL
                 OR c.last_created <= v_now - make_interval(days => v_threshold)))
     ORDER BY c.user_id
     LIMIT v_max
    RETURNING 1
  )
  SELECT count(*) INTO v_dispatched FROM inserted;

  UPDATE public.oculto_user_survey_campaigns SET
    total_eligible            = v_eligible,
    total_skipped_completed   = v_skipped_completed,
    total_skipped_in_progress = v_skipped_in_progress,
    total_skipped_recent      = v_skipped_recent,
    total_sent                = v_dispatched,
    status                    = 'completed',
    finished_at               = now()
  WHERE id = v_campaign_id;

  RETURN jsonb_build_object(
    'campaign_id',         v_campaign_id,
    'dry_run',             false,
    'filter',              v_filter,
    'threshold_days',      v_threshold,
    'eligible',            v_eligible,
    'dispatched',          v_dispatched,
    'skipped_completed',   v_skipped_completed,
    'skipped_in_progress', v_skipped_in_progress,
    'skipped_recent',      v_skipped_recent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_dispatch_survey_batch(text, boolean, int, int)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
