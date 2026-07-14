-- =====================================================================
-- BLOCO F · SECURITY HARDENING (idempotente · External Supabase)
-- Data: 2026-05-05
-- Objetivo: corrigir findings críticos do scan sem quebrar a app.
-- Itens cobertos:
--   1. system_settings → remove leitura anônima
--   2. user_trust_scores → expõe só agregado público; detalhes só dono/admin
--   3. cookie_consents → remove brecha session_id IS NOT NULL
--   4. storage support_attachments → leitura só dono/admin
--   5. profiles_safe (VIEW) → camada pública sem PII (preparação para
--      refatorar reads de outros usuários sem quebrar nada hoje)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) system_settings · remove acesso anônimo
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can read settings" ON public.system_settings';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view non-sensitive settings" ON public.system_settings';
    EXECUTE $POL$
      CREATE POLICY "Authenticated users can view non-sensitive settings"
        ON public.system_settings
        FOR SELECT
        TO authenticated
        USING (
          key NOT ILIKE '%secret%'
          AND key NOT ILIKE '%api_key%'
          AND key NOT ILIKE '%token%'
          AND key NOT ILIKE '%password%'
        )
    $POL$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2) user_trust_scores · só dono/admin veem o detalhamento
--    (guard: só executa se a tabela existir)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_trust_scores'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Trust scores are viewable by everyone" ON public.user_trust_scores';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their own trust score details" ON public.user_trust_scores';
    EXECUTE 'DROP POLICY IF EXISTS "Owner or admin reads trust scores" ON public.user_trust_scores';
    EXECUTE $POL$
      CREATE POLICY "Owner or admin reads trust scores"
        ON public.user_trust_scores
        FOR SELECT
        TO authenticated
        USING (
          user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin_master')
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'moderator')
        )
    $POL$;
    EXECUTE $V$
      CREATE OR REPLACE VIEW public.user_trust_scores_public
      WITH (security_invoker = true) AS
      SELECT
        user_id,
        COALESCE(verification_points, 0)
          + COALESCE(activity_points, 0)
          + COALESCE(response_rate_points, 0)
          + COALESCE(profile_completion_points, 0)
          - COALESCE(report_penalty, 0) AS trust_score_total
      FROM public.user_trust_scores
    $V$;
    EXECUTE 'GRANT SELECT ON public.user_trust_scores_public TO authenticated, anon';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) cookie_consents · session_id IS NOT NULL era brecha (lê tudo)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cookie_consents'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their own cookie consent" ON public.cookie_consents';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update their own cookie consent" ON public.cookie_consents';
    EXECUTE 'DROP POLICY IF EXISTS "Users read own cookie consents" ON public.cookie_consents';
    EXECUTE 'DROP POLICY IF EXISTS "Users update own cookie consents" ON public.cookie_consents';
    EXECUTE $POL$
      CREATE POLICY "Users read own cookie consents"
        ON public.cookie_consents
        FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id)
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "Users update own cookie consents"
        ON public.cookie_consents
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $POL$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4) storage.objects · support_attachments deve ser privado
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owner or admin reads support attachments" ON storage.objects;

CREATE POLICY "Owner or admin reads support attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'support_attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin_master')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'moderator')
    )
  );

-- Marca o bucket como privado (defensivo)
UPDATE storage.buckets SET public = false WHERE id = 'support_attachments';

-- ---------------------------------------------------------------------
-- 5) profiles · compatibilidade de schema para ambientes legados
--    Cria colunas opcionais usadas pela view pública quando estiverem ausentes.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'free',
      ADD COLUMN IF NOT EXISTS profile_type text,
      ADD COLUMN IF NOT EXISTS gender text,
      ADD COLUMN IF NOT EXISTS partner1_name text,
      ADD COLUMN IF NOT EXISTS partner2_name text,
      ADD COLUMN IF NOT EXISTS pair_photos text[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS pair_bio text,
      ADD COLUMN IF NOT EXISTS tags_social text[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS tags_adult text[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS connection_mode boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_looking_now boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS looking_now_since timestamptz DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS show_on_radar boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS hide_age boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS hide_location boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_invisible boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS accept_super_dm boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS min_super_dm_price numeric DEFAULT 5,
      ADD COLUMN IF NOT EXISTS super_dm_estimated_response_hours integer DEFAULT 24,
      ADD COLUMN IF NOT EXISTS ranking_anonymity boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS show_fan_ranking boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS voice_bio_url text,
      ADD COLUMN IF NOT EXISTS voice_bio_duration integer,
      ADD COLUMN IF NOT EXISTS dm_unlock_price numeric(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_pioneiro boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_lifetime boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_oculto_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS vip_tier text DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS is_anonymized boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_shadowbanned boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS location_lat numeric(10,8),
      ADD COLUMN IF NOT EXISTS location_lng numeric(11,8),
      ADD COLUMN IF NOT EXISTS address_city text,
      ADD COLUMN IF NOT EXISTS address_state text;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_vip'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ADD COLUMN is_vip boolean GENERATED ALWAYS AS (plan_type = ''vip'') STORED';
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 6) profiles_safe · VIEW pública sem PII (preparação)
--    Resiliente: cria NULLs/defaults quando colunas ainda não existem.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  has_hide_location boolean;
  has_hide_age boolean;
  has_birth_date boolean;
  has_account_status boolean;
  has_is_anonymized boolean;
  has_is_shadowbanned boolean;
  view_sql text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'hide_location'
    ) INTO has_hide_location;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'hide_age'
    ) INTO has_hide_age;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'birth_date'
    ) INTO has_birth_date;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'account_status'
    ) INTO has_account_status;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_anonymized'
    ) INTO has_is_anonymized;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_shadowbanned'
    ) INTO has_is_shadowbanned;

    view_sql := $SQL$
      CREATE OR REPLACE VIEW public.profiles_safe
      WITH (security_invoker = true) AS
      SELECT
        p.id,
        p.user_id,
        p.name,
        p.username,
        p.avatar_url,
        p.cover_image_url,
        p.bio,
        p.is_online,
        p.last_seen,
        p.show_online_status,
        p.is_verified,
        p.is_verified_couple,
        COALESCE(to_jsonb(p) ->> 'is_oculto_verified', 'false')::boolean AS is_oculto_verified,
        p.is_creator,
        p.is_vip,
        p.vip_tier,
        p.is_pioneiro,
        p.is_lifetime,
        p.plan_type,
        p.profile_type,
        p.gender,
        p.partner1_name,
        p.partner2_name,
        p.pair_photos,
        p.pair_bio,
        p.tags_social,
        p.tags_adult,
        p.connection_mode,
        p.is_looking_now,
        p.looking_now_since,
        p.show_on_radar,
        COALESCE(to_jsonb(p) ->> 'hide_age', 'false')::boolean AS hide_age,
        COALESCE(to_jsonb(p) ->> 'hide_location', 'false')::boolean AS hide_location,
        p.is_private,
        p.is_invisible,
        p.accept_super_dm,
        p.min_super_dm_price,
        p.super_dm_auto_reply_enabled,
        p.super_dm_estimated_response_hours,
        p.ranking_anonymity,
        p.show_fan_ranking,
        p.voice_bio_url,
        p.voice_bio_duration,
        p.dm_unlock_price,$SQL$;

    IF has_hide_location THEN
      view_sql := view_sql || $SQL$
        CASE WHEN COALESCE(p.hide_location, false) = false THEN p.location_lat END AS location_lat,
        CASE WHEN COALESCE(p.hide_location, false) = false THEN p.location_lng END AS location_lng,
        CASE WHEN COALESCE(p.hide_location, false) = false THEN p.address_city END AS address_city,
        CASE WHEN COALESCE(p.hide_location, false) = false THEN p.address_state END AS address_state,$SQL$;
    ELSE
      view_sql := view_sql || $SQL$
        p.location_lat AS location_lat,
        p.location_lng AS location_lng,
        p.address_city AS address_city,
        p.address_state AS address_state,$SQL$;
    END IF;

    IF has_hide_age AND has_birth_date THEN
      view_sql := view_sql || $SQL$
        CASE
          WHEN COALESCE(p.hide_age, false) = true THEN NULL
          WHEN p.birth_date IS NULL THEN NULL
          ELSE EXTRACT(YEAR FROM age(p.birth_date))::int
        END AS age,$SQL$;
    ELSE
      view_sql := view_sql || $SQL$
        NULL::int AS age,$SQL$;
    END IF;

    view_sql := view_sql || $SQL$
        p.created_at,
        p.updated_at
      FROM public.profiles p
      WHERE 1 = 1$SQL$;

    IF has_account_status THEN
      view_sql := view_sql || $SQL$ AND p.account_status = 'active'$SQL$;
    END IF;

    IF has_is_anonymized THEN
      view_sql := view_sql || $SQL$ AND (p.is_anonymized IS NULL OR p.is_anonymized = false)$SQL$;
    END IF;

    IF has_is_shadowbanned THEN
      view_sql := view_sql || $SQL$ AND (p.is_shadowbanned IS NULL OR p.is_shadowbanned = false)$SQL$;
    END IF;

    EXECUTE view_sql;
    EXECUTE 'GRANT SELECT ON public.profiles_safe TO authenticated, anon';
  END IF;
END $$;

-- =====================================================================
-- FIM
-- =====================================================================
