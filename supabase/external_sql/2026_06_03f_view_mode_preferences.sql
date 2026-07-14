-- ============================================================
-- ETAPA — Modos de Visualização (preferências por usuário)
-- Externo: rvybbrkzmboqbhcemqar.supabase.co
-- Idempotente
-- ============================================================

-- 1) Função updated_at compartilhada ----------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 2) Tabela de preferências por usuário -------------------------
CREATE TABLE IF NOT EXISTS public.oculto_user_experience_preferences (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE,
  view_mode                 TEXT NOT NULL DEFAULT 'simple',
  has_seen_view_mode_modal  BOOLEAN NOT NULL DEFAULT FALSE,
  modal_seen_at             TIMESTAMPTZ,
  modal_snoozed_until       TIMESTAMPTZ,
  custom_sections           JSONB NOT NULL DEFAULT '{}'::jsonb,
  version                   INTEGER NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oculto_user_experience_view_mode_chk
    CHECK (view_mode IN ('simple','custom','complete'))
);

CREATE INDEX IF NOT EXISTS idx_oculto_user_experience_preferences_user
  ON public.oculto_user_experience_preferences (user_id);

-- 3) Grants -----------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.oculto_user_experience_preferences TO authenticated;
GRANT ALL ON public.oculto_user_experience_preferences TO service_role;

-- 4) Trigger updated_at ----------------------------------------
DROP TRIGGER IF EXISTS trg_oculto_user_experience_preferences_updated_at
  ON public.oculto_user_experience_preferences;

CREATE TRIGGER trg_oculto_user_experience_preferences_updated_at
  BEFORE UPDATE ON public.oculto_user_experience_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5) RLS --------------------------------------------------------
ALTER TABLE public.oculto_user_experience_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own experience preferences"
  ON public.oculto_user_experience_preferences;
DROP POLICY IF EXISTS "Users can create own experience preferences"
  ON public.oculto_user_experience_preferences;
DROP POLICY IF EXISTS "Users can update own experience preferences"
  ON public.oculto_user_experience_preferences;
DROP POLICY IF EXISTS "Admin master can read all experience preferences"
  ON public.oculto_user_experience_preferences;
DROP POLICY IF EXISTS "Admin master can write all experience preferences"
  ON public.oculto_user_experience_preferences;

CREATE POLICY "Users can read own experience preferences"
  ON public.oculto_user_experience_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own experience preferences"
  ON public.oculto_user_experience_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own experience preferences"
  ON public.oculto_user_experience_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Master admin (reutiliza função existente)
CREATE POLICY "Admin master can read all experience preferences"
  ON public.oculto_user_experience_preferences
  FOR SELECT
  USING (public._is_master_admin(auth.uid()));

CREATE POLICY "Admin master can write all experience preferences"
  ON public.oculto_user_experience_preferences
  FOR ALL
  USING (public._is_master_admin(auth.uid()))
  WITH CHECK (public._is_master_admin(auth.uid()));

-- 6) Realtime ---------------------------------------------------
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime'
     AND schemaname='public'
     AND tablename='oculto_user_experience_preferences';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_user_experience_preferences';
  END IF;
END$$;

-- 7) Migração: usuários existentes recebem 'simple' --------------
-- profiles.user_id = auth.users.id no projeto; fallback para profiles.id.
INSERT INTO public.oculto_user_experience_preferences (user_id, view_mode, has_seen_view_mode_modal, custom_sections)
SELECT DISTINCT COALESCE(p.user_id, p.id) AS uid, 'simple', false, '{}'::jsonb
  FROM public.profiles p
 WHERE COALESCE(p.user_id, p.id) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.oculto_user_experience_preferences pref
      WHERE pref.user_id = COALESCE(p.user_id, p.id)
   )
ON CONFLICT (user_id) DO NOTHING;
