-- =====================================================================
-- ETAPA 2 — Google OAuth + Completar Cadastro
-- Projeto EXTERNO: rvybbrkzmboqbhcemqar
-- IDEMPOTENTE — pode rodar várias vezes.
--
-- O que faz:
--   1) Adiciona colunas em public.profiles para suportar o fluxo Google:
--      - auth_provider          (email|google|apple|...)
--      - adult_confirmed_at     (timestamp do aceite +18)
--      - privacy_accepted_at    (timestamp do aceite Privacidade/LGPD)
--      - terms_accepted_at      (timestamp do aceite Termos de Uso)
--   2) Garante que onboarding_completed exista (DEFAULT false).
--   3) Atualiza o trigger handle_new_user para capturar:
--      raw_app_meta_data->>'provider'  → auth_provider
--      raw_user_meta_data->>'name'/'full_name' → name
--      raw_user_meta_data->>'avatar_url' / 'picture' → avatar_url
--      Sem mexer em username (será definido no /completar-cadastro).
--   4) View v_profile_completion: cálculo único da regra "perfil completo".
-- =====================================================================

BEGIN;

-- 1) Colunas novas em profiles ----------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_provider        text,
  ADD COLUMN IF NOT EXISTS adult_confirmed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS terms_accepted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_auth_provider
  ON public.profiles(auth_provider);

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
  ON public.profiles(onboarding_completed) WHERE onboarding_completed = false;

-- 2) Trigger handle_new_user (idempotente, preserva username manual) --
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider   text := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  v_name       text := COALESCE(
                          NEW.raw_user_meta_data->>'name',
                          NEW.raw_user_meta_data->>'full_name',
                          split_part(NEW.email, '@', 1)
                        );
  v_avatar     text := COALESCE(
                          NEW.raw_user_meta_data->>'avatar_url',
                          NEW.raw_user_meta_data->>'picture'
                        );
  v_username   text := NEW.raw_user_meta_data->>'username';
BEGIN
  INSERT INTO public.profiles (id, user_id, name, username, avatar_url, auth_provider, onboarding_completed, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.id,
    v_name,
    v_username,           -- pode ser NULL p/ Google; será exigido no /completar-cadastro
    v_avatar,
    v_provider,
    false,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET name          = COALESCE(public.profiles.name,       EXCLUDED.name),
        avatar_url    = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
        auth_provider = COALESCE(public.profiles.auth_provider, EXCLUDED.auth_provider),
        user_id       = COALESCE(public.profiles.user_id,    EXCLUDED.user_id),
        updated_at    = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) View única para "perfil completo" --------------------------------
-- Regra: tem username, name, birth_date, gender, terms/privacy/adult aceitos,
--        e onboarding_completed = true.
DROP VIEW IF EXISTS public.v_profile_completion;
CREATE VIEW public.v_profile_completion
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.user_id,
  p.username,
  p.onboarding_completed,
  (
    p.username            IS NOT NULL AND length(trim(p.username))   > 0
    AND p.name             IS NOT NULL AND length(trim(p.name))       > 0
    AND p.birth_date       IS NOT NULL
    AND p.gender           IS NOT NULL AND length(trim(p.gender))     > 0
    AND p.terms_accepted_at   IS NOT NULL
    AND p.privacy_accepted_at IS NOT NULL
    AND p.adult_confirmed_at  IS NOT NULL
    AND COALESCE(p.onboarding_completed, false) = true
  ) AS is_profile_complete
FROM public.profiles p;

GRANT SELECT ON public.v_profile_completion TO authenticated;
GRANT SELECT ON public.v_profile_completion TO anon;

-- 4) RPC de conveniência para o frontend ------------------------------
CREATE OR REPLACE FUNCTION public.my_profile_completion()
RETURNS TABLE(is_complete boolean, missing text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles%ROWTYPE;
  miss text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ARRAY['profile_not_found']::text[];
    RETURN;
  END IF;

  IF p.username IS NULL OR length(trim(p.username)) = 0 THEN miss := miss || 'username'; END IF;
  IF p.name     IS NULL OR length(trim(p.name))     = 0 THEN miss := miss || 'name';     END IF;
  IF p.birth_date IS NULL                                 THEN miss := miss || 'birth_date'; END IF;
  IF p.gender   IS NULL OR length(trim(p.gender))   = 0 THEN miss := miss || 'gender';   END IF;
  IF p.terms_accepted_at   IS NULL THEN miss := miss || 'terms';   END IF;
  IF p.privacy_accepted_at IS NULL THEN miss := miss || 'privacy'; END IF;
  IF p.adult_confirmed_at  IS NULL THEN miss := miss || 'adult';   END IF;
  IF NOT COALESCE(p.onboarding_completed, false) THEN miss := miss || 'onboarding'; END IF;

  RETURN QUERY SELECT (array_length(miss,1) IS NULL), miss;
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_profile_completion() TO authenticated;

COMMIT;

-- =====================================================================
-- AÇÃO MANUAL NO PAINEL DO SUPABASE EXTERNO (após rodar este SQL):
--
-- 1) Authentication → Providers → Google: ENABLE
--    - Client ID    = (seu Client ID do Google Cloud)
--    - Client Secret = (seu Client Secret do Google Cloud)
--    - Skip nonce check: OFF
--
-- 2) Authentication → URL Configuration:
--    - Site URL:          https://ocultoswing.com.br
--    - Redirect URLs (adicione TODAS):
--        https://ocultoswing.com.br/auth/callback
--        https://oculta-gems.lovable.app/auth/callback
--        https://id-preview--1d65ae60-fb47-4778-9540-6a3d59bdb670.lovable.app/auth/callback
--        http://localhost:3000/auth/callback
--        http://localhost:5173/auth/callback
--
-- 3) No Google Cloud Console → APIs & Services → Credentials →
--    OAuth Client → Authorized redirect URIs, adicione:
--        https://rvybbrkzmboqbhcemqar.supabase.co/auth/v1/callback
-- =====================================================================
