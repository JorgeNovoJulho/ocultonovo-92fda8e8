-- =========================================================================
-- Laboratório Oculto — Feature Flags
-- Idempotente. Cole no SQL Editor do Supabase Externo.
-- =========================================================================

-- 1) Enum de modo de rollout
DO $$ BEGIN
  CREATE TYPE public.feature_rollout_mode AS ENUM
    ('disabled','admin_only','beta_users','percentage','global');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tabela
CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key         text NOT NULL UNIQUE,
  enabled             boolean NOT NULL DEFAULT false,
  rollout_mode        public.feature_rollout_mode NOT NULL DEFAULT 'disabled',
  rollout_percentage  smallint NOT NULL DEFAULT 0,
  admin_only          boolean NOT NULL DEFAULT true,
  beta_users          uuid[] NOT NULL DEFAULT '{}'::uuid[],
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_feature_flags_pct_chk
    CHECK (rollout_percentage BETWEEN 0 AND 100)
);

-- 3) GRANTs
GRANT SELECT ON public.platform_feature_flags TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.platform_feature_flags TO authenticated;
GRANT ALL ON public.platform_feature_flags TO service_role;

-- 4) RLS
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flags_read_all"     ON public.platform_feature_flags;
DROP POLICY IF EXISTS "flags_write_master" ON public.platform_feature_flags;

CREATE POLICY "flags_read_all" ON public.platform_feature_flags
  FOR SELECT USING (true);

CREATE POLICY "flags_write_master" ON public.platform_feature_flags
  FOR ALL TO authenticated
  USING (public._is_master_admin(auth.uid()))
  WITH CHECK (public._is_master_admin(auth.uid()));

-- 5) Trigger updated_at
CREATE OR REPLACE FUNCTION public._feature_flags_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_feature_flags_touch ON public.platform_feature_flags;
CREATE TRIGGER trg_feature_flags_touch
  BEFORE UPDATE ON public.platform_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public._feature_flags_touch();

-- 6) RPC: decide se uma flag está ativa para um usuário
CREATE OR REPLACE FUNCTION public.feature_flag_is_enabled(
  p_key text,
  p_user_id uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.platform_feature_flags;
  bucket int;
BEGIN
  SELECT * INTO f FROM public.platform_feature_flags WHERE feature_key = p_key;
  IF NOT FOUND OR NOT f.enabled THEN RETURN false; END IF;

  -- Master sempre vê tudo
  IF p_user_id IS NOT NULL AND public._is_master_admin(p_user_id) THEN
    RETURN true;
  END IF;

  RETURN CASE f.rollout_mode
    WHEN 'disabled'   THEN false
    WHEN 'admin_only' THEN false  -- master já passou acima
    WHEN 'global'     THEN true
    WHEN 'beta_users' THEN p_user_id = ANY(f.beta_users)
    WHEN 'percentage' THEN (
      p_user_id IS NOT NULL
      AND (('x' || substr(md5(p_key || '::' || p_user_id::text), 1, 8))::bit(32)::int % 100)
          < f.rollout_percentage
    )
    ELSE false
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.feature_flag_is_enabled(text, uuid) TO authenticated, anon;

-- 7) Seed das 6 flags iniciais (não sobrescreve)
INSERT INTO public.platform_feature_flags (feature_key, description, enabled, rollout_mode, admin_only)
VALUES
  ('today_in_oculto',     'Curadoria diária "Hoje no Oculto" na home.',                false, 'disabled', true),
  ('journey_system',      'Sistema de Jornadas do usuário (onboarding gamificado).',   false, 'disabled', true),
  ('ai_concierge',        'Concierge IA contextual (sugestões e atalhos).',            false, 'disabled', true),
  ('historical_timeline', 'Linha do tempo histórica do usuário no Oculto.',            false, 'disabled', true),
  ('profile_visitors',    'Painel rico de visitantes do perfil (além do atual).',      false, 'disabled', true),
  ('retention_dashboard', 'Hub central de retenção (XP/níveis/missões/ranking).',      false, 'disabled', true)
ON CONFLICT (feature_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
