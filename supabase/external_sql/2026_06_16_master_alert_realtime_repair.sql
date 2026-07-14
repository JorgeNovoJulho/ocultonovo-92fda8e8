-- ============================================================
-- REPARO · Alerta de entrada online do administrador master
-- Execute no SQL Editor do Supabase EXTERNO.
-- Idempotente: pode rodar várias vezes.
--
-- Corrige os pontos que impedem o modal de aparecer:
-- 1) Garante tabela/linha de configuração do alerta.
-- 2) Garante permissões + RLS para o master canônico.
-- 3) Garante Realtime em profiles e oculto_master_alert_settings.
-- 4) Garante REPLICA IDENTITY FULL para o evento UPDATE trazer old/new.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_master_alert_settings (
  id                  text PRIMARY KEY DEFAULT 'singleton',
  enabled             boolean NOT NULL DEFAULT true,
  sound_preset        text NOT NULL DEFAULT 'chime',
  sound_url           text,
  volume              numeric(3,2) NOT NULL DEFAULT 0.85,
  recurrence_seconds  integer NOT NULL DEFAULT 30,
  auto_open_modal     boolean NOT NULL DEFAULT true,
  last_triggered_at   timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oculto_master_alert_settings_singleton CHECK (id = 'singleton')
);

ALTER TABLE public.oculto_master_alert_settings
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound_preset text NOT NULL DEFAULT 'chime',
  ADD COLUMN IF NOT EXISTS sound_url text,
  ADD COLUMN IF NOT EXISTS volume numeric(3,2) NOT NULL DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS recurrence_seconds integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS auto_open_modal boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE ON public.oculto_master_alert_settings TO authenticated;
GRANT ALL ON public.oculto_master_alert_settings TO service_role;

CREATE OR REPLACE FUNCTION public.is_master_admin_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.id = _uid OR p.user_id = _uid)
      AND (
        lower(regexp_replace(coalesce(p.username,''), '[\s_\-.]+', '', 'g')) = 'ocultomaster'
        OR lower(coalesce(p.email,'')) = 'ocultomaster@ocultoswing.com.br'
        OR lower(regexp_replace(coalesce(p.name,''), '[\s_\-.]+', '', 'g')) = 'ocultomaster'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _uid
      AND lower(coalesce(u.email,'')) = 'ocultomaster@ocultoswing.com.br'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin_user(uuid) TO authenticated, anon, service_role;

ALTER TABLE public.oculto_master_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_can_read_alert_settings ON public.oculto_master_alert_settings;
DROP POLICY IF EXISTS master_can_upsert_alert_settings ON public.oculto_master_alert_settings;
DROP POLICY IF EXISTS master_can_update_alert_settings ON public.oculto_master_alert_settings;
DROP POLICY IF EXISTS master_can_delete_alert_settings ON public.oculto_master_alert_settings;

CREATE POLICY master_can_read_alert_settings
  ON public.oculto_master_alert_settings
  FOR SELECT
  TO authenticated
  USING (public.is_master_admin_user(auth.uid()));

CREATE POLICY master_can_upsert_alert_settings
  ON public.oculto_master_alert_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_master_admin_user(auth.uid()));

CREATE POLICY master_can_update_alert_settings
  ON public.oculto_master_alert_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_master_admin_user(auth.uid()))
  WITH CHECK (public.is_master_admin_user(auth.uid()));

INSERT INTO public.oculto_master_alert_settings (
  id, enabled, sound_preset, sound_url, volume, recurrence_seconds, auto_open_modal
)
VALUES ('singleton', true, 'chime', NULL, 0.85, 30, true)
ON CONFLICT (id) DO UPDATE
SET enabled = true,
    auto_open_modal = true,
    sound_preset = COALESCE(NULLIF(public.oculto_master_alert_settings.sound_preset, ''), 'chime'),
    volume = COALESCE(public.oculto_master_alert_settings.volume, 0.85),
    recurrence_seconds = LEAST(GREATEST(COALESCE(public.oculto_master_alert_settings.recurrence_seconds, 30), 5), 120),
    updated_at = now();

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_master_alert_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_master_alert_settings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_master_alert_settings';
  END IF;
END $$;

SELECT
  'master_alert_realtime_repair_ok' AS status,
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) AS profiles_realtime,
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_master_alert_settings'
  ) AS settings_realtime;