-- =====================================================================
-- LGPD WAVE 2 — Sistema de Consentimentos Granulares + Versões de Política
-- Data: 2026-05-15
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =====================================================================

-- 1) Tabela de versões de política (Privacidade, Termos, Cookies, Adulto)
CREATE TABLE IF NOT EXISTS public.lgpd_policy_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_kind   text NOT NULL CHECK (policy_kind IN ('privacy','terms','cookies','adult','dpa')),
  version       text NOT NULL,
  effective_at  timestamptz NOT NULL DEFAULT now(),
  summary       text,
  url           text,
  is_current    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_kind, version)
);

CREATE INDEX IF NOT EXISTS idx_lgpd_policy_versions_kind_current
  ON public.lgpd_policy_versions(policy_kind) WHERE is_current = true;

ALTER TABLE public.lgpd_policy_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lgpd_policy_versions_read_all ON public.lgpd_policy_versions;
CREATE POLICY lgpd_policy_versions_read_all
  ON public.lgpd_policy_versions FOR SELECT
  TO anon, authenticated
  USING (true);

-- Apenas admin master grava (ajuste o critério se já houver outra função is_master)
DROP POLICY IF EXISTS lgpd_policy_versions_write_master ON public.lgpd_policy_versions;
CREATE POLICY lgpd_policy_versions_write_master
  ON public.lgpd_policy_versions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin_master'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin_master'
    )
  );

-- 2) Tabela de consentimentos granulares (1 linha por (user|session) + tipo)
CREATE TABLE IF NOT EXISTS public.lgpd_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      text,
  consent_type    text NOT NULL CHECK (consent_type IN (
    'cookies_analytics','cookies_marketing','cookies_personalization',
    'geolocation_radar','geolocation_aura','geolocation_events',
    'aura_match','realtime_presence',
    'notifications_push','notifications_email','marketing_campaigns',
    'adult_content','data_sharing_partners','privacy_policy','terms_of_use'
  )),
  granted         boolean NOT NULL,
  policy_version  text,
  source          text,                -- onboarding | settings | banner | checkout
  ip_addr         inet,
  user_agent      text,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- Unicidade por usuário ou por sessão anônima + tipo
CREATE UNIQUE INDEX IF NOT EXISTS uq_lgpd_consents_user_type
  ON public.lgpd_consents(user_id, consent_type) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lgpd_consents_session_type
  ON public.lgpd_consents(session_id, consent_type) WHERE session_id IS NOT NULL AND user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lgpd_consents_user ON public.lgpd_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_consents_type ON public.lgpd_consents(consent_type);

ALTER TABLE public.lgpd_consents ENABLE ROW LEVEL SECURITY;

-- O usuário lê apenas os próprios consentimentos
DROP POLICY IF EXISTS lgpd_consents_select_own ON public.lgpd_consents;
CREATE POLICY lgpd_consents_select_own
  ON public.lgpd_consents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admin master vê tudo (auditoria)
DROP POLICY IF EXISTS lgpd_consents_select_master ON public.lgpd_consents;
CREATE POLICY lgpd_consents_select_master
  ON public.lgpd_consents FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin_master')
  );

-- Escrita só via RPC (SECURITY DEFINER). Bloqueia INSERT/UPDATE/DELETE direto.
REVOKE INSERT, UPDATE, DELETE ON public.lgpd_consents FROM anon, authenticated;

-- 3) RPC: registrar consentimento (com upsert e revogação)
CREATE OR REPLACE FUNCTION public.lgpd_set_consent(
  p_consent_type   text,
  p_granted        boolean,
  p_source         text DEFAULT 'settings',
  p_session_id     text DEFAULT NULL,
  p_policy_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_now  timestamptz := now();
  v_ver  text := p_policy_version;
BEGIN
  IF p_consent_type IS NULL THEN
    RAISE EXCEPTION 'consent_type é obrigatório';
  END IF;
  IF v_user IS NULL AND (p_session_id IS NULL OR length(p_session_id) < 6) THEN
    RAISE EXCEPTION 'É preciso usuário autenticado ou session_id válido';
  END IF;

  -- Resolve versão atual da política, se não informada
  IF v_ver IS NULL THEN
    SELECT version INTO v_ver
    FROM public.lgpd_policy_versions
    WHERE is_current = true
      AND policy_kind = CASE
        WHEN p_consent_type LIKE 'cookies_%' THEN 'cookies'
        WHEN p_consent_type = 'adult_content' THEN 'adult'
        WHEN p_consent_type = 'terms_of_use' THEN 'terms'
        ELSE 'privacy'
      END
    ORDER BY effective_at DESC
    LIMIT 1;
  END IF;

  IF v_user IS NOT NULL THEN
    INSERT INTO public.lgpd_consents
      (user_id, consent_type, granted, policy_version, source, granted_at, revoked_at)
    VALUES
      (v_user, p_consent_type, p_granted, v_ver, p_source, v_now,
       CASE WHEN p_granted THEN NULL ELSE v_now END)
    ON CONFLICT (user_id, consent_type) WHERE user_id IS NOT NULL
    DO UPDATE SET
      granted = EXCLUDED.granted,
      policy_version = COALESCE(EXCLUDED.policy_version, public.lgpd_consents.policy_version),
      source = EXCLUDED.source,
      granted_at = CASE WHEN EXCLUDED.granted THEN v_now ELSE public.lgpd_consents.granted_at END,
      revoked_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE v_now END;
  ELSE
    INSERT INTO public.lgpd_consents
      (session_id, consent_type, granted, policy_version, source, granted_at, revoked_at)
    VALUES
      (p_session_id, p_consent_type, p_granted, v_ver, p_source, v_now,
       CASE WHEN p_granted THEN NULL ELSE v_now END)
    ON CONFLICT (session_id, consent_type) WHERE session_id IS NOT NULL AND user_id IS NULL
    DO UPDATE SET
      granted = EXCLUDED.granted,
      policy_version = COALESCE(EXCLUDED.policy_version, public.lgpd_consents.policy_version),
      source = EXCLUDED.source,
      granted_at = CASE WHEN EXCLUDED.granted THEN v_now ELSE public.lgpd_consents.granted_at END,
      revoked_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE v_now END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'consent_type', p_consent_type, 'granted', p_granted, 'policy_version', v_ver);
END;
$$;

REVOKE ALL ON FUNCTION public.lgpd_set_consent(text,boolean,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lgpd_set_consent(text,boolean,text,text,text) TO anon, authenticated;

-- 4) RPC: ler todos os consentimentos do usuário corrente
CREATE OR REPLACE FUNCTION public.lgpd_get_my_consents()
RETURNS TABLE (
  consent_type   text,
  granted        boolean,
  policy_version text,
  source         text,
  granted_at     timestamptz,
  revoked_at     timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT consent_type, granted, policy_version, source, granted_at, revoked_at
  FROM public.lgpd_consents
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.lgpd_get_my_consents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lgpd_get_my_consents() TO authenticated;

-- 5) RPC: versões correntes (para o frontend detectar bumps)
CREATE OR REPLACE FUNCTION public.lgpd_current_policy_versions()
RETURNS TABLE (policy_kind text, version text, effective_at timestamptz, url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT policy_kind, version, effective_at, url
  FROM public.lgpd_policy_versions
  WHERE is_current = true;
$$;

REVOKE ALL ON FUNCTION public.lgpd_current_policy_versions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lgpd_current_policy_versions() TO anon, authenticated;

-- 6) Seed inicial de versões correntes (idempotente)
INSERT INTO public.lgpd_policy_versions (policy_kind, version, summary, url, is_current)
VALUES
  ('privacy','v3.0','Política de Privacidade LGPD v3.0','/legal/privacidade', true),
  ('terms',  '2026-05-05.5','Termos de Uso','/legal/termos-de-uso', true),
  ('cookies','v3.0','Política de Cookies LGPD v3.0','/legal/cookies', true),
  ('adult',  'v1.0','Termo de conteúdo adulto +18','/legal/termos-de-uso', true)
ON CONFLICT (policy_kind, version) DO NOTHING;

-- Confirma que apenas a versão acima está como current por kind
UPDATE public.lgpd_policy_versions a
SET is_current = false
WHERE is_current = true
  AND EXISTS (
    SELECT 1 FROM public.lgpd_policy_versions b
    WHERE b.policy_kind = a.policy_kind
      AND b.is_current = true
      AND b.effective_at > a.effective_at
  );

-- =====================================================================
-- FIM. Validação rápida sugerida:
--   SELECT * FROM public.lgpd_current_policy_versions();
--   SELECT public.lgpd_set_consent('cookies_analytics', true, 'settings');
--   SELECT * FROM public.lgpd_get_my_consents();
-- =====================================================================
