-- =====================================================================
-- 2026-06-20 — Profiles: views seguras (v_public_profiles / v_my_profile)
-- Banco EXTERNO (rvybbrkzmboqbhcemqar). Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) v_public_profiles — colunas seguras para qualquer autenticado
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_public_profiles CASCADE;

CREATE VIEW public.v_public_profiles
AS
SELECT
  id, user_id, username, name, avatar_url, cover_image_url, bio,
  voice_bio_url, voice_bio_duration,
  is_online, last_seen,
  is_verified, is_verified_couple, is_oculto_verified,
  profile_type, plan_type, is_creator, is_vip, vip_tier, is_lifetime,
  is_pioneiro, is_seed, is_private, is_invisible,
  gender, hide_age, hide_location,
  is_looking_now, looking_now_since,
  has_ghost_mode, is_ghost_active,
  show_on_radar, show_online_status,
  account_status, is_anonymized, is_shadowbanned,
  accept_super_dm, min_super_dm_price,
  super_dm_auto_reply_enabled, super_dm_estimated_response_hours,
  ranking_anonymity, show_fan_ranking,
  tags_social, tags_adult, connection_mode,
  pair_photos, pair_bio,
  partner1_name, partner2_name,
  location_lat, location_lng,
  created_at, updated_at
FROM public.profiles
WHERE account_status = 'active'
  AND (is_anonymized IS NULL OR is_anonymized = false)
  AND (is_shadowbanned IS NULL OR is_shadowbanned = false);

GRANT SELECT ON public.v_public_profiles TO authenticated;
REVOKE ALL ON public.v_public_profiles FROM anon;

-- ---------------------------------------------------------------------
-- 2) v_my_profile — perfil completo do próprio usuário
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_my_profile CASCADE;

CREATE VIEW public.v_my_profile
AS
SELECT *
FROM public.profiles
WHERE user_id = auth.uid();

GRANT SELECT ON public.v_my_profile TO authenticated;
REVOKE ALL ON public.v_my_profile FROM anon;

-- ---------------------------------------------------------------------
-- 3) Reload do PostgREST
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- ETAPA B — NÃO RODAR ENQUANTO O FRONTEND NÃO MIGRAR
-- =====================================================================
-- DROP POLICY IF EXISTS "Authenticated users see public profiles" ON public.profiles;
-- CREATE POLICY "profiles_select_owner_or_admin"
--   ON public.profiles FOR SELECT TO authenticated
--   USING (
--     user_id = auth.uid()
--     OR has_role(auth.uid(), 'admin_master'::text)
--     OR has_role(auth.uid(), 'admin_regional'::text)
--     OR has_role(auth.uid(), 'moderator'::text)
--   );
--
-- REVOKE SELECT (
--   cpf_cnpj, pix_key, pix_key_type, balance, pending_balance,
--   stripe_customer_id, asaas_wallet_id,
--   kyc_type, kyc_document_url, kyc_selfie_url, kyc_submitted_at,
--   phone_number, birth_date, partner1_birth_date, partner2_birth_date,
--   address_street, address_number, address_complement, address_neighborhood,
--   address_city, address_state, address_cep, address_lat, address_lng,
--   risk_level, risk_flags, suspicious_flag_reason,
--   balance_frozen_reason, ban_reason, shadowban_reason,
--   notification_preferences, device_settings,
--   payment_status, payment_due_date, subscription_amount,
--   verification_deadline
-- ) ON public.profiles FROM authenticated;
--
-- NOTIFY pgrst, 'reload schema';
