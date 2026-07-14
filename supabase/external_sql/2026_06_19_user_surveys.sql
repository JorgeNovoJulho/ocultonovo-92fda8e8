-- =========================================================================
-- 2026-06-19 — Sistema de Pesquisa Conversacional do OCULTO
-- Tabelas:
--   * oculto_user_surveys           (1 pesquisa por usuário em andamento/concluída)
--   * oculto_user_survey_steps      (respostas passo a passo)
--   * oculto_user_survey_campaigns  (campanhas administrativas de disparo)
-- Idempotente — pode ser reexecutado sem efeitos colaterais.
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =========================================================================

-- =========================================================================
-- 1) TABELA: oculto_user_surveys
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.oculto_user_surveys (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL,
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','in_progress','completed','skipped')),
  source_channel          text,
  source_channel_other    text,
  first_impression        text,
  first_impression_note   text,
  main_interest           text,
  main_interest_note      text,
  main_friction           text,
  main_friction_note      text,
  return_reason           text,
  return_reason_note      text,
  reward_given            boolean NOT NULL DEFAULT false,
  started_at              timestamptz,
  completed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_user_surveys_user_id    ON public.oculto_user_surveys (user_id);
CREATE INDEX IF NOT EXISTS idx_oculto_user_surveys_status     ON public.oculto_user_surveys (status);
CREATE INDEX IF NOT EXISTS idx_oculto_user_surveys_created_at ON public.oculto_user_surveys (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_user_surveys TO authenticated;
GRANT ALL ON public.oculto_user_surveys TO service_role;

ALTER TABLE public.oculto_user_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_surveys_select_own_or_master ON public.oculto_user_surveys;
CREATE POLICY user_surveys_select_own_or_master
  ON public.oculto_user_surveys FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_master());

DROP POLICY IF EXISTS user_surveys_insert_own ON public.oculto_user_surveys;
CREATE POLICY user_surveys_insert_own
  ON public.oculto_user_surveys FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin_master());

DROP POLICY IF EXISTS user_surveys_update_own_or_master ON public.oculto_user_surveys;
CREATE POLICY user_surveys_update_own_or_master
  ON public.oculto_user_surveys FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_master())
  WITH CHECK (auth.uid() = user_id OR public.is_admin_master());

DROP POLICY IF EXISTS user_surveys_delete_master ON public.oculto_user_surveys;
CREATE POLICY user_surveys_delete_master
  ON public.oculto_user_surveys FOR DELETE TO authenticated
  USING (public.is_admin_master());

-- =========================================================================
-- 2) TABELA: oculto_user_survey_steps
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.oculto_user_survey_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     uuid NOT NULL REFERENCES public.oculto_user_surveys(id) ON DELETE CASCADE,
  step_number   integer NOT NULL,
  question_key  text NOT NULL,
  answer_type   text NOT NULL CHECK (answer_type IN ('choice','text','rating','boolean','multi','other')),
  answer_value  text,
  answer_note   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_user_survey_steps_survey     ON public.oculto_user_survey_steps (survey_id);
CREATE INDEX IF NOT EXISTS idx_oculto_user_survey_steps_created_at ON public.oculto_user_survey_steps (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_user_survey_steps_question   ON public.oculto_user_survey_steps (question_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oculto_user_survey_steps_survey_step
  ON public.oculto_user_survey_steps (survey_id, step_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_user_survey_steps TO authenticated;
GRANT ALL ON public.oculto_user_survey_steps TO service_role;

ALTER TABLE public.oculto_user_survey_steps ENABLE ROW LEVEL SECURITY;

-- Visibilidade: dono da pesquisa OU master
DROP POLICY IF EXISTS user_survey_steps_select_own_or_master ON public.oculto_user_survey_steps;
CREATE POLICY user_survey_steps_select_own_or_master
  ON public.oculto_user_survey_steps FOR SELECT TO authenticated
  USING (
    public.is_admin_master()
    OR EXISTS (
      SELECT 1 FROM public.oculto_user_surveys s
       WHERE s.id = oculto_user_survey_steps.survey_id
         AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS user_survey_steps_insert_own_or_master ON public.oculto_user_survey_steps;
CREATE POLICY user_survey_steps_insert_own_or_master
  ON public.oculto_user_survey_steps FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_master()
    OR EXISTS (
      SELECT 1 FROM public.oculto_user_surveys s
       WHERE s.id = oculto_user_survey_steps.survey_id
         AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS user_survey_steps_update_own_or_master ON public.oculto_user_survey_steps;
CREATE POLICY user_survey_steps_update_own_or_master
  ON public.oculto_user_survey_steps FOR UPDATE TO authenticated
  USING (
    public.is_admin_master()
    OR EXISTS (
      SELECT 1 FROM public.oculto_user_surveys s
       WHERE s.id = oculto_user_survey_steps.survey_id
         AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin_master()
    OR EXISTS (
      SELECT 1 FROM public.oculto_user_surveys s
       WHERE s.id = oculto_user_survey_steps.survey_id
         AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS user_survey_steps_delete_master ON public.oculto_user_survey_steps;
CREATE POLICY user_survey_steps_delete_master
  ON public.oculto_user_survey_steps FOR DELETE TO authenticated
  USING (public.is_admin_master());

-- =========================================================================
-- 3) TABELA: oculto_user_survey_campaigns
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.oculto_user_survey_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      uuid,
  target_type     text NOT NULL DEFAULT 'all'
                  CHECK (target_type IN ('all','old_users','new_users','premium','vip')),
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','completed')),
  total_sent      integer NOT NULL DEFAULT 0,
  total_completed integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_user_survey_campaigns_status     ON public.oculto_user_survey_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_oculto_user_survey_campaigns_created_at ON public.oculto_user_survey_campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_user_survey_campaigns_created_by ON public.oculto_user_survey_campaigns (created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_user_survey_campaigns TO authenticated;
GRANT ALL ON public.oculto_user_survey_campaigns TO service_role;

ALTER TABLE public.oculto_user_survey_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_survey_campaigns_master_all ON public.oculto_user_survey_campaigns;
CREATE POLICY user_survey_campaigns_master_all
  ON public.oculto_user_survey_campaigns FOR ALL TO authenticated
  USING (public.is_admin_master())
  WITH CHECK (public.is_admin_master());

-- =========================================================================
-- 4) Trigger updated_at em oculto_user_surveys
-- =========================================================================
CREATE OR REPLACE FUNCTION public.oculto_user_surveys_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_user_surveys_updated_at ON public.oculto_user_surveys;
CREATE TRIGGER trg_oculto_user_surveys_updated_at
  BEFORE UPDATE ON public.oculto_user_surveys
  FOR EACH ROW EXECUTE FUNCTION public.oculto_user_surveys_touch_updated_at();

-- =========================================================================
-- 5) REPLICA IDENTITY FULL + Realtime
-- =========================================================================
ALTER TABLE public.oculto_user_surveys           REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_user_survey_steps      REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_user_survey_campaigns  REPLICA IDENTITY FULL;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'oculto_user_surveys',
    'oculto_user_survey_steps',
    'oculto_user_survey_campaigns'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
