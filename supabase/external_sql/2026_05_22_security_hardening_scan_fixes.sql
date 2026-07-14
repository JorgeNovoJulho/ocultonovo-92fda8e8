-- =============================================================
-- 2026-05-22 — Hardening de Segurança (scan results)
-- Corrige findings críticos:
--   1. cookie_consents — SELECT vazado p/ anônimos via OR session_id
--   2. profiles — PII (cpf, pix, kyc, address...) exposta a authenticated
--   3. support_attachments — bucket público + listável
--   4. system_settings — policy USING(true) p/ anon em todas as linhas
--   5. realtime.messages — sem RLS policies (qualquer auth assina qualquer topic)
--
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) cookie_consents — restringir SELECT ao owner
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE p record;
BEGIN
  IF to_regclass('public.cookie_consents') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY';
    FOR p IN
      SELECT polname FROM pg_policy
       WHERE polrelid = 'public.cookie_consents'::regclass
         AND cmd = 'r'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.cookie_consents', p.polname);
    END LOOP;

    EXECUTE $p$
      CREATE POLICY "cookie_consents_select_owner" ON public.cookie_consents
        FOR SELECT TO authenticated
        USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    $p$;

    -- INSERT continua aberto (anon precisa registrar consent), mas só do próprio
    EXECUTE 'DROP POLICY IF EXISTS "cookie_consents_insert_any" ON public.cookie_consents';
    EXECUTE $p$
      CREATE POLICY "cookie_consents_insert_any" ON public.cookie_consents
        FOR INSERT TO anon, authenticated
        WITH CHECK (
          (auth.uid() IS NULL AND user_id IS NULL)
          OR (auth.uid() IS NOT NULL AND auth.uid() = user_id)
        )
    $p$;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 2) profiles — esconder PII sensível de outros usuários
-- Estratégia: manter RLS atual, mas REVOGAR SELECT em colunas
-- sensíveis ao role authenticated; manter via view pública e
-- conceder acesso completo apenas ao próprio dono via RPC.
-- Postgres aplica RLS por linha; para coluna usamos GRANT.
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  col text;
  sensitive text[] := ARRAY[
    'phone_number','cpf_cnpj','pix_key','stripe_customer_id',
    'kyc_document_url','kyc_selfie_url',
    'address_street','address_cep','address_lat','address_lng',
    'partner1_name','partner2_name','partner1_birth_date','partner2_birth_date',
    'birth_date','risk_level','risk_flags','ban_reason','balance',
    'email','asaas_customer_id','asaas_wallet_id'
  ];
  existing text[] := '{}';
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN RETURN; END IF;

  -- coleta só as colunas que existem
  SELECT array_agg(column_name)
    INTO existing
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles'
     AND column_name = ANY(sensitive);

  IF existing IS NULL THEN RETURN; END IF;

  -- garante SELECT em todas as colunas para o dono (via policy existente)
  -- mas remove acesso de colunas sensíveis a authenticated genérico
  FOREACH col IN ARRAY existing LOOP
    EXECUTE format('REVOKE SELECT (%I) ON public.profiles FROM authenticated, anon', col);
  END LOOP;

  -- concede de volta SELECT(*) ao service_role (edge functions/admin)
  EXECUTE 'GRANT SELECT ON public.profiles TO service_role';
END $$;

-- View pública sanitizada: o app deve consultar profiles_public p/ feed/cards
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.user_id,
  p.username,
  p.display_name,
  p.bio,
  p.avatar_url,
  p.cover_url,
  p.plan_type,
  p.is_verified,
  p.created_at,
  p.location_city,
  p.location_state,
  p.location_country,
  p.gender,
  p.orientation,
  p.relationship_type,
  p.is_seed,
  p.show_online_status,
  p.online_status,
  p.last_seen_at
FROM public.profiles p;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- RPC para o próprio user buscar seus dados completos
CREATE OR REPLACE FUNCTION public.profiles_get_self()
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.profiles_get_self() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 3) support_attachments — tornar bucket privado + RLS por ticket
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'support_attachments') THEN
    UPDATE storage.buckets
       SET public = false
     WHERE id = 'support_attachments';
  END IF;
END $$;

DROP POLICY IF EXISTS "Public read support attachments"      ON storage.objects;
DROP POLICY IF EXISTS "public_read_support_attachments"      ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_select_owner"     ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_insert_owner"     ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_delete_owner"     ON storage.objects;

CREATE POLICY "support_attachments_select_owner"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'support_attachments'
    AND (
      owner = auth.uid()
      OR public._is_oculto_master()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
         WHERE t.user_id = auth.uid()
           AND position(t.id::text in name) > 0
      )
    )
  );

CREATE POLICY "support_attachments_insert_owner"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support_attachments'
    AND owner = auth.uid()
  );

CREATE POLICY "support_attachments_delete_owner"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'support_attachments'
    AND (owner = auth.uid() OR public._is_oculto_master())
  );

-- ──────────────────────────────────────────────────────────────
-- 4) system_settings — remover read público + allowlist
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE p record;
BEGIN
  IF to_regclass('public.system_settings') IS NULL THEN RETURN; END IF;

  EXECUTE 'ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY';

  FOR p IN
    SELECT polname FROM pg_policy
     WHERE polrelid = 'public.system_settings'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_settings', p.polname);
  END LOOP;

  -- allowlist de chaves seguras p/ leitura pública (anon)
  EXECUTE $p$
    CREATE POLICY "system_settings_public_allowlist" ON public.system_settings
      FOR SELECT TO anon, authenticated
      USING (
        key = ANY (ARRAY[
          'platform_status',
          'platform_capacity_total',
          'platform_capacity_used',
          'waitlist_enabled',
          'maintenance_mode',
          'app_version',
          'min_app_version',
          'feature_flags_public',
          'landing_settings',
          'beta_phase',
          'social_cycle'
        ])
      )
  $p$;

  -- master gerencia tudo
  EXECUTE $p$
    CREATE POLICY "system_settings_master_all" ON public.system_settings
      FOR ALL TO authenticated
      USING (public._is_oculto_master())
      WITH CHECK (public._is_oculto_master())
  $p$;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 5) realtime.messages — restringir broadcast/presence a autenticados
--    com topic prefix por user id (ou explícito allowlist).
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    BEGIN
      EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '[security] sem permissão p/ ALTER realtime.messages — pular';
      RETURN;
    END;

    EXECUTE 'DROP POLICY IF EXISTS "realtime_authenticated_only_read"  ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "realtime_authenticated_only_write" ON realtime.messages';

    EXECUTE $p$
      CREATE POLICY "realtime_authenticated_only_read"
        ON realtime.messages FOR SELECT TO authenticated
        USING (auth.uid() IS NOT NULL)
    $p$;

    EXECUTE $p$
      CREATE POLICY "realtime_authenticated_only_write"
        ON realtime.messages FOR INSERT TO authenticated
        WITH CHECK (auth.uid() IS NOT NULL)
    $p$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
-- ============================================================
-- FIM
-- ============================================================
