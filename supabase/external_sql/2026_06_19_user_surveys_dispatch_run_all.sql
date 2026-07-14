-- =========================================================================
-- 2026-06-19 — Disparo manual em massa da Pesquisa OCULTO
-- Equivalente ao RPC oculto_dispatch_survey_batch('all', false, 10000, 7),
-- porém executável diretamente no SQL Editor (service_role), sem precisar
-- de auth.uid() / is_admin_master().
--
-- Regras aplicadas:
--   * Apenas profiles reais (is_seed = false, user_id não nulo)
--   * NÃO reenvia para usuários que já completaram ou pularam a pesquisa
--   * NÃO reenvia para quem está com pesquisa em andamento (in_progress)
--   * NÃO reenvia para quem recebeu pesquisa pendente nos últimos 7 dias
--   * Logs obrigatórios em oculto_user_survey_campaigns
--
-- Rodar uma única vez no SQL Editor do Supabase EXTERNO.
-- =========================================================================

DO $$
DECLARE
  v_campaign_id          uuid;
  v_now                  timestamptz := now();
  v_threshold            int := 7;
  v_eligible             int := 0;
  v_skipped_completed    int := 0;
  v_skipped_in_progress  int := 0;
  v_skipped_recent       int := 0;
  v_dispatched           int := 0;
BEGIN
  -- 1) Cria a campanha (log obrigatório)
  INSERT INTO public.oculto_user_survey_campaigns
    (created_by, target_type, target_filter, status, dry_run, notify_threshold_days)
  VALUES
    (NULL, 'all', 'all', 'active', false, v_threshold)
  RETURNING id INTO v_campaign_id;

  -- 2) Universo de candidatos + última pesquisa de cada um
  CREATE TEMP TABLE _bulk_cand ON COMMIT DROP AS
  SELECT
    p.user_id,
    (SELECT s.status
       FROM public.oculto_user_surveys s
      WHERE s.user_id = p.user_id
      ORDER BY s.created_at DESC LIMIT 1) AS last_status,
    (SELECT s.created_at
       FROM public.oculto_user_surveys s
      WHERE s.user_id = p.user_id
      ORDER BY s.created_at DESC LIMIT 1) AS last_created
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL
    AND coalesce(p.is_seed, false) = false;

  v_eligible := (SELECT count(*) FROM _bulk_cand);

  v_skipped_completed := (
    SELECT count(*) FROM _bulk_cand
     WHERE last_status IN ('completed','skipped')
  );

  v_skipped_in_progress := (
    SELECT count(*) FROM _bulk_cand
     WHERE last_status = 'in_progress'
  );

  v_skipped_recent := (
    SELECT count(*) FROM _bulk_cand
     WHERE last_status = 'pending'
       AND last_created IS NOT NULL
       AND last_created > v_now - make_interval(days => v_threshold)
  );

  -- 3) Insere pesquisa pendente para os elegíveis
  WITH targets AS (
    SELECT user_id
      FROM _bulk_cand
     WHERE last_status IS NULL
        OR (last_status = 'pending'
            AND (last_created IS NULL
                 OR last_created <= v_now - make_interval(days => v_threshold)))
  ), ins AS (
    INSERT INTO public.oculto_user_surveys
      (user_id, status, dispatched_via_campaign_id, dispatched_by, notified_at)
    SELECT t.user_id, 'pending', v_campaign_id, NULL, v_now
      FROM targets t
    RETURNING id
  )
  SELECT count(*) INTO v_dispatched FROM ins;

  -- 4) Atualiza contadores da campanha
  UPDATE public.oculto_user_survey_campaigns
     SET total_eligible            = v_eligible,
         total_skipped_completed   = v_skipped_completed,
         total_skipped_in_progress = v_skipped_in_progress,
         total_skipped_recent      = v_skipped_recent,
         total_sent                = v_dispatched,
         status                    = 'completed'
   WHERE id = v_campaign_id;

  RAISE NOTICE 'Campanha % | elegíveis=% | já_concluídos=% | em_andamento=% | recentes=% | disparados=%',
    v_campaign_id, v_eligible, v_skipped_completed, v_skipped_in_progress, v_skipped_recent, v_dispatched;
END $$;

-- Conferência rápida (opcional)
SELECT id, target_filter, status,
       total_eligible, total_skipped_completed, total_skipped_in_progress,
       total_skipped_recent, total_sent, created_at
  FROM public.oculto_user_survey_campaigns
 ORDER BY created_at DESC
 LIMIT 5;
