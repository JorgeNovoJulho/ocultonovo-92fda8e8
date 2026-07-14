-- =========================================================================
-- 2026-06-19 — HOTFIX: pesquisa concluída nunca deve voltar a disparar alerta
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
--
-- Corrige para TODOS os usuários:
--   1) Se o usuário já concluiu/recebeu recompensa/pulou a pesquisa,
--      qualquer pesquisa pendente/em andamento duplicada é marcada como skipped.
--   2) Recria o RPC de disparo para considerar o histórico inteiro do usuário,
--      não apenas a última linha. Assim campanhas futuras não recriam pending
--      para quem já finalizou o fluxo.
-- =========================================================================

-- 1) Limpeza de pendências duplicadas para usuários que já finalizaram o fluxo
UPDATE public.oculto_user_surveys s
   SET status     = 'skipped',
       updated_at = now()
 WHERE s.status IN ('pending', 'in_progress')
   AND EXISTS (
     SELECT 1
       FROM public.oculto_user_surveys done
      WHERE done.user_id = s.user_id
        AND done.id <> s.id
        AND (
          done.status IN ('completed', 'skipped')
          OR COALESCE(done.reward_given, false) = true
        )
   );

-- 2) RPC de disparo em lote endurecido contra reenvio pós-conclusão
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
  IF NOT public.is_admin_master() THEN
    RAISE EXCEPTION 'forbidden: master only';
  END IF;

  IF v_filter NOT IN ('all','active','inactive','premium','vip','creators') THEN
    RAISE EXCEPTION 'invalid filter: %', v_filter;
  END IF;

  INSERT INTO public.oculto_user_survey_campaigns
    (created_by, target_type, target_filter, status,
     dry_run, notify_threshold_days)
  VALUES
    (auth.uid(), 'all', v_filter,
     CASE WHEN p_dry_run THEN 'draft' ELSE 'active' END,
     p_dry_run, v_threshold)
  RETURNING id INTO v_campaign_id;

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
    EXISTS (
      SELECT 1
        FROM public.oculto_user_surveys s
       WHERE s.user_id = b.user_id
         AND (s.status IN ('completed','skipped') OR COALESCE(s.reward_given, false) = true)
    ) AS has_done,
    EXISTS (
      SELECT 1
        FROM public.oculto_user_surveys s
       WHERE s.user_id = b.user_id
         AND s.status = 'in_progress'
    ) AS has_in_progress,
    EXISTS (
      SELECT 1
        FROM public.oculto_user_surveys s
       WHERE s.user_id = b.user_id
         AND s.status = 'pending'
         AND s.created_at > v_now - make_interval(days => v_threshold)
    ) AS has_recent_pending,
    EXISTS (
      SELECT 1
        FROM public.oculto_user_surveys s
       WHERE s.user_id = b.user_id
    ) AS has_any_survey
  FROM base b;

  v_eligible            := (SELECT count(*) FROM _survey_cand);
  v_skipped_completed   := (SELECT count(*) FROM _survey_cand WHERE has_done);
  v_skipped_in_progress := (SELECT count(*) FROM _survey_cand WHERE NOT has_done AND has_in_progress);
  v_skipped_recent      := (SELECT count(*) FROM _survey_cand WHERE NOT has_done AND NOT has_in_progress AND has_recent_pending);

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

  WITH inserted AS (
    INSERT INTO public.oculto_user_surveys
      (user_id, status, dispatched_via_campaign_id, dispatched_by, notified_at)
    SELECT c.user_id, 'pending', v_campaign_id, auth.uid(), v_now
      FROM _survey_cand c
     WHERE c.has_done = false
       AND c.has_in_progress = false
       AND c.has_recent_pending = false
       AND c.has_any_survey = false
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