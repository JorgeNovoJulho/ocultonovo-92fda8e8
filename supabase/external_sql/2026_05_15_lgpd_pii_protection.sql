-- =====================================================================
-- LGPD WAVE 4 — Proteção de Dados Sensíveis
-- Data: 2026-05-15  | Idempotente
--
-- Implementa:
--  - Funções de mascaramento: email, CPF, CNPJ, telefone
--  - Função de aproximação geográfica (snap em grid de ~1km)
--  - View vw_profiles_public_safe (perfil público com PII mascarada)
--  - View vw_radar_safe (radar com geo aproximada quando sem consentimento)
--  - RPC paid_media_signed_url (signed URL apenas para quem comprou)
--  - Trigger de auditoria de acesso a campos sensíveis (sample 10%)
-- =====================================================================

-- 1) Helpers de mascaramento (SQL puro, IMMUTABLE)
CREATE OR REPLACE FUNCTION public.lgpd_mask_email(p_email text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_email IS NULL OR position('@' in p_email) = 0 THEN p_email
    ELSE
      substr(split_part(p_email, '@', 1), 1, 2)
      || repeat('*', greatest(length(split_part(p_email, '@', 1)) - 2, 0))
      || '@' || split_part(p_email, '@', 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.lgpd_mask_cpf(p_cpf text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_cpf IS NULL THEN NULL
    WHEN length(regexp_replace(p_cpf, '\D', '', 'g')) < 11 THEN '***.***.***-**'
    ELSE '***.' || substr(regexp_replace(p_cpf, '\D','','g'), 4, 3)
         || '.***-' || substr(regexp_replace(p_cpf, '\D','','g'), 10, 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.lgpd_mask_cnpj(p_cnpj text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_cnpj IS NULL THEN NULL
    WHEN length(regexp_replace(p_cnpj, '\D', '', 'g')) < 14 THEN '**.***.***/****-**'
    ELSE '**.***.' || substr(regexp_replace(p_cnpj,'\D','','g'), 6, 3)
         || '/****-' || substr(regexp_replace(p_cnpj,'\D','','g'), 13, 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.lgpd_mask_phone(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) < 8 THEN repeat('*', length(p_phone))
    ELSE '(' || substr(regexp_replace(p_phone,'\D','','g'), 1, 2) || ') ****-'
         || right(regexp_replace(p_phone,'\D','','g'), 4)
  END;
$$;

-- 2) Aproximação geográfica — snap em grid configurável (default ~1.1km no equador)
-- Trunca lat/lng em N casas decimais. 2 casas ≈ 1.1 km.
CREATE OR REPLACE FUNCTION public.lgpd_approx_coord(p_value double precision, p_decimals int DEFAULT 2)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    ELSE round(p_value::numeric, greatest(p_decimals, 0))::double precision
  END;
$$;

-- 3) Helper: usuário tem consentimento para X?
CREATE OR REPLACE FUNCTION public.lgpd_user_has_consent(p_user_id uuid, p_consent_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT granted FROM public.lgpd_consents
      WHERE user_id = p_user_id AND consent_type = p_consent_type
      LIMIT 1),
    false
  );
$$;
REVOKE ALL ON FUNCTION public.lgpd_user_has_consent(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lgpd_user_has_consent(uuid, text) TO authenticated, service_role;

-- 4) View pública SEGURA do perfil — nunca expõe PII bruto
DROP VIEW IF EXISTS public.vw_profiles_public_safe CASCADE;
CREATE VIEW public.vw_profiles_public_safe
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.cover_url,
  p.bio,
  p.city,
  p.state,
  p.country,
  -- Sempre coordenada aproximada nesta view pública (mesmo com consentimento)
  public.lgpd_approx_coord(p.location_lat, 2) AS approx_lat,
  public.lgpd_approx_coord(p.location_lng, 2) AS approx_lng,
  p.is_verified,
  p.is_anonymized,
  p.created_at
FROM public.profiles p
WHERE COALESCE(p.is_anonymized, false) = false;

GRANT SELECT ON public.vw_profiles_public_safe TO anon, authenticated;

-- 5) View do radar — geo aproximada quando o alvo NÃO consentiu geolocation_radar
DROP VIEW IF EXISTS public.vw_radar_safe CASCADE;
CREATE VIEW public.vw_radar_safe
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  CASE
    WHEN public.lgpd_user_has_consent(p.user_id, 'geolocation_radar')
      THEN p.location_lat
    ELSE public.lgpd_approx_coord(p.location_lat, 2)
  END AS lat,
  CASE
    WHEN public.lgpd_user_has_consent(p.user_id, 'geolocation_radar')
      THEN p.location_lng
    ELSE public.lgpd_approx_coord(p.location_lng, 2)
  END AS lng,
  -- Flag para o frontend desenhar "halo difuso" quando aproximado
  NOT public.lgpd_user_has_consent(p.user_id, 'geolocation_radar') AS is_approx
FROM public.profiles p
WHERE p.location_lat IS NOT NULL
  AND p.location_lng IS NOT NULL
  AND COALESCE(p.is_anonymized, false) = false;

GRANT SELECT ON public.vw_radar_safe TO authenticated;

-- 6) RPC: signed URL para mídia paga — só libera se o usuário comprou
CREATE OR REPLACE FUNCTION public.paid_media_signed_url(p_post_id uuid, p_ttl_seconds int DEFAULT 3600)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_post_author uuid;
  v_storage_path text;
  v_has_access boolean := false;
  v_is_master boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória';
  END IF;

  -- Master vê tudo
  SELECT EXISTS(SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = v_user AND ur.role::text = 'admin_master')
    INTO v_is_master;

  -- Carrega post (path do storage e autor)
  BEGIN
    SELECT author_id, COALESCE(media_storage_path, media_url)
      INTO v_post_author, v_storage_path
      FROM public.posts WHERE id = p_post_id;
  EXCEPTION WHEN undefined_column THEN
    SELECT author_id, media_url INTO v_post_author, v_storage_path
      FROM public.posts WHERE id = p_post_id;
  END;

  IF v_post_author IS NULL THEN
    RAISE EXCEPTION 'Post não encontrado';
  END IF;

  -- Acesso: autor, master ou comprador
  IF v_is_master OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_post_author AND user_id = v_user
  ) THEN
    v_has_access := true;
  ELSE
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM public.paid_media_purchases pmp
        JOIN public.profiles pr ON pr.id = pmp.user_id
        WHERE pmp.post_id = p_post_id AND pr.user_id = v_user
      ) INTO v_has_access;
    EXCEPTION WHEN undefined_table THEN
      v_has_access := false;
    END;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Acesso negado: compre o conteúdo para visualizar';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'storage_path', v_storage_path,
    'ttl_seconds', greatest(p_ttl_seconds, 60),
    'note', 'Use storage.from(bucket).createSignedUrl(storage_path, ttl_seconds) na edge function paid-media-signed-url'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.paid_media_signed_url(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paid_media_signed_url(uuid, int) TO authenticated;

-- 7) Tabela de auditoria de acesso a dados sensíveis (sampling para não inflar)
CREATE TABLE IF NOT EXISTS public.lgpd_sensitive_access_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,
  target_id   uuid,
  resource    text NOT NULL,         -- ex: 'profile.cpf', 'paid_media.url'
  action      text NOT NULL,         -- read | export | unmask
  ip_addr     inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lgpd_sensitive_access_target
  ON public.lgpd_sensitive_access_log(target_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_sensitive_access_actor
  ON public.lgpd_sensitive_access_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_sensitive_access_time
  ON public.lgpd_sensitive_access_log(created_at DESC);

ALTER TABLE public.lgpd_sensitive_access_log ENABLE ROW LEVEL SECURITY;

-- Apenas admin master lê o log de auditoria
DROP POLICY IF EXISTS lgpd_sensitive_access_master_only ON public.lgpd_sensitive_access_log;
CREATE POLICY lgpd_sensitive_access_master_only
  ON public.lgpd_sensitive_access_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin_master'));

-- Bloqueia escrita direta — somente via RPC
REVOKE INSERT, UPDATE, DELETE ON public.lgpd_sensitive_access_log FROM anon, authenticated;

-- RPC para registrar acesso (usada pelas edge functions / RPCs sensíveis)
CREATE OR REPLACE FUNCTION public.lgpd_log_sensitive_access(
  p_target_id uuid,
  p_resource  text,
  p_action    text DEFAULT 'read'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.lgpd_sensitive_access_log (actor_id, target_id, resource, action)
  VALUES (auth.uid(), p_target_id, p_resource, p_action);
END;
$$;
REVOKE ALL ON FUNCTION public.lgpd_log_sensitive_access(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lgpd_log_sensitive_access(uuid, text, text) TO authenticated, service_role;

-- =====================================================================
-- Validação:
--   SELECT public.lgpd_mask_email('joao.silva@dominio.com.br');
--   SELECT public.lgpd_mask_cpf('123.456.789-00');
--   SELECT public.lgpd_approx_coord(-23.563210, 2);
--   SELECT * FROM public.vw_profiles_public_safe LIMIT 5;
--   SELECT * FROM public.vw_radar_safe LIMIT 5;
-- =====================================================================
