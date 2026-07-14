-- 2026_06_03h — Painel "Experiência do Oculto" (Admin Master)
-- Idempotente. Executar no SQL Editor do Supabase externo.

-- =========================================================
-- 1) Tabela de settings runtime (singleton)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.oculto_experience_mode_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled                     BOOLEAN NOT NULL DEFAULT TRUE,
  default_new_user_mode       TEXT    NOT NULL DEFAULT 'simple',
  default_existing_user_mode  TEXT    NOT NULL DEFAULT 'simple',
  force_migration_modal       BOOLEAN NOT NULL DEFAULT TRUE,
  hidden_sessions_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  hidden_sessions_title       TEXT    NOT NULL DEFAULT 'Sessões Ocultas',
  hidden_sessions_description TEXT    NOT NULL DEFAULT 'Explore stories, criadores, salas, eventos, Caixa Oculta, leilões e descobertas especiais.',
  modal_title                 TEXT    NOT NULL DEFAULT 'O Oculto ficou mais leve e inteligente ✨',
  modal_description           TEXT    NOT NULL DEFAULT 'Agora você pode escolher como deseja visualizar sua experiência dentro da plataforma.',
  simple_label                TEXT    NOT NULL DEFAULT 'Modo Simples',
  custom_label                TEXT    NOT NULL DEFAULT 'Modo Personalizado',
  complete_label              TEXT    NOT NULL DEFAULT 'Universo Completo',
  sections_config             JSONB   NOT NULL DEFAULT '{}'::jsonb,
  hidden_sessions_order       JSONB   NOT NULL DEFAULT '[]'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oculto_experience_default_new_mode_chk
    CHECK (default_new_user_mode IN ('simple','custom','complete')),
  CONSTRAINT oculto_experience_default_existing_mode_chk
    CHECK (default_existing_user_mode IN ('simple','custom','complete'))
);

GRANT SELECT ON public.oculto_experience_mode_settings TO anon, authenticated;
GRANT ALL    ON public.oculto_experience_mode_settings TO service_role;

ALTER TABLE public.oculto_experience_mode_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oculto_experience_settings_read   ON public.oculto_experience_mode_settings;
DROP POLICY IF EXISTS oculto_experience_settings_write  ON public.oculto_experience_mode_settings;

-- Leitura pública (config global) — não contém dados sensíveis
CREATE POLICY oculto_experience_settings_read
  ON public.oculto_experience_mode_settings
  FOR SELECT
  USING (TRUE);

-- Escrita apenas Master Admin
CREATE POLICY oculto_experience_settings_write
  ON public.oculto_experience_mode_settings
  FOR ALL
  USING (public._is_master_admin())
  WITH CHECK (public._is_master_admin());

-- Seed único
INSERT INTO public.oculto_experience_mode_settings (enabled)
SELECT TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.oculto_experience_mode_settings);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.oculto_experience_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_experience_touch ON public.oculto_experience_mode_settings;
CREATE TRIGGER trg_oculto_experience_touch
  BEFORE UPDATE ON public.oculto_experience_mode_settings
  FOR EACH ROW EXECUTE FUNCTION public.oculto_experience_touch_updated_at();

-- =========================================================
-- 2) Tabela de logs/auditoria
-- =========================================================
CREATE TABLE IF NOT EXISTS public.oculto_experience_mode_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID,
  action      TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT ON public.oculto_experience_mode_logs TO authenticated;
GRANT ALL    ON public.oculto_experience_mode_logs TO service_role;

ALTER TABLE public.oculto_experience_mode_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oculto_experience_logs_read  ON public.oculto_experience_mode_logs;
DROP POLICY IF EXISTS oculto_experience_logs_write ON public.oculto_experience_mode_logs;

CREATE POLICY oculto_experience_logs_read
  ON public.oculto_experience_mode_logs
  FOR SELECT
  USING (public._is_master_admin());

CREATE POLICY oculto_experience_logs_write
  ON public.oculto_experience_mode_logs
  FOR INSERT
  WITH CHECK (public._is_master_admin());

CREATE INDEX IF NOT EXISTS idx_oculto_experience_logs_created
  ON public.oculto_experience_mode_logs (created_at DESC);

-- =========================================================
-- 3) RPCs admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.oculto_experience_settings_get()
RETURNS public.oculto_experience_mode_settings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.oculto_experience_mode_settings
  ORDER BY created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.oculto_experience_settings_update(p_patch JSONB)
RETURNS public.oculto_experience_mode_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_id UUID;
  row_out public.oculto_experience_mode_settings;
BEGIN
  IF NOT public._is_master_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO row_id FROM public.oculto_experience_mode_settings
  ORDER BY created_at ASC LIMIT 1;

  IF row_id IS NULL THEN
    INSERT INTO public.oculto_experience_mode_settings DEFAULT VALUES RETURNING id INTO row_id;
  END IF;

  UPDATE public.oculto_experience_mode_settings
  SET
    enabled                     = COALESCE((p_patch->>'enabled')::boolean,                     enabled),
    default_new_user_mode       = COALESCE(p_patch->>'default_new_user_mode',                  default_new_user_mode),
    default_existing_user_mode  = COALESCE(p_patch->>'default_existing_user_mode',             default_existing_user_mode),
    force_migration_modal       = COALESCE((p_patch->>'force_migration_modal')::boolean,       force_migration_modal),
    hidden_sessions_enabled     = COALESCE((p_patch->>'hidden_sessions_enabled')::boolean,     hidden_sessions_enabled),
    hidden_sessions_title       = COALESCE(p_patch->>'hidden_sessions_title',                  hidden_sessions_title),
    hidden_sessions_description = COALESCE(p_patch->>'hidden_sessions_description',            hidden_sessions_description),
    modal_title                 = COALESCE(p_patch->>'modal_title',                            modal_title),
    modal_description           = COALESCE(p_patch->>'modal_description',                      modal_description),
    simple_label                = COALESCE(p_patch->>'simple_label',                           simple_label),
    custom_label                = COALESCE(p_patch->>'custom_label',                           custom_label),
    complete_label              = COALESCE(p_patch->>'complete_label',                         complete_label),
    sections_config             = COALESCE(p_patch->'sections_config',                         sections_config),
    hidden_sessions_order       = COALESCE(p_patch->'hidden_sessions_order',                   hidden_sessions_order)
  WHERE id = row_id
  RETURNING * INTO row_out;

  INSERT INTO public.oculto_experience_mode_logs (actor_id, action, payload)
  VALUES (auth.uid(), 'settings_update', p_patch);

  RETURN row_out;
END;
$$;

-- Reset do modal de migração para todos os usuários
CREATE OR REPLACE FUNCTION public.oculto_experience_modal_reset_all()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT public._is_master_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.oculto_user_experience_preferences
  SET has_seen_view_mode_modal = FALSE,
      modal_seen_at = NULL,
      modal_snoozed_until = NULL
  WHERE has_seen_view_mode_modal = TRUE OR modal_snoozed_until IS NOT NULL;

  GET DIAGNOSTICS n = ROW_COUNT;

  INSERT INTO public.oculto_experience_mode_logs (actor_id, action, payload)
  VALUES (auth.uid(), 'modal_reset_all', jsonb_build_object('affected', n));

  RETURN n;
END;
$$;

-- Métricas agregadas (alimentam aba "Métricas" do painel admin)
CREATE OR REPLACE FUNCTION public.oculto_experience_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public._is_master_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT
      view_mode,
      has_seen_view_mode_modal,
      modal_snoozed_until,
      updated_at,
      COALESCE(jsonb_object_length(custom_sections), 0) AS sections_count
    FROM public.oculto_user_experience_preferences
  ),
  dist AS (
    SELECT view_mode AS mode, COUNT(*)::int AS c
    FROM base GROUP BY view_mode
  )
  SELECT jsonb_build_object(
    'total_users',       (SELECT COUNT(*) FROM base),
    'distribution',      COALESCE((SELECT jsonb_object_agg(mode, c) FROM dist), '{}'::jsonb),
    'modal_seen',        (SELECT COUNT(*) FROM base WHERE has_seen_view_mode_modal = TRUE),
    'modal_snoozed',     (SELECT COUNT(*) FROM base WHERE modal_snoozed_until IS NOT NULL AND modal_snoozed_until > NOW()),
    'top_custom_users',  (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('sections_count', sections_count, 'updated_at', updated_at) ORDER BY sections_count DESC), '[]'::jsonb)
      FROM (
        SELECT sections_count, updated_at
        FROM base
        WHERE view_mode = 'custom'
        ORDER BY sections_count DESC
        LIMIT 10
      ) q
    ),
    'last_change',       (SELECT MAX(updated_at) FROM base)
  ) INTO result;

  RETURN result;
END;
$$;

-- Lista de logs (últimos N)
CREATE OR REPLACE FUNCTION public.oculto_experience_logs_list(p_limit INT DEFAULT 100)
RETURNS SETOF public.oculto_experience_mode_logs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.oculto_experience_mode_logs
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500))
$$;

GRANT EXECUTE ON FUNCTION public.oculto_experience_settings_get()                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oculto_experience_settings_update(JSONB)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.oculto_experience_modal_reset_all()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.oculto_experience_metrics()                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.oculto_experience_logs_list(INT)                       TO authenticated;
