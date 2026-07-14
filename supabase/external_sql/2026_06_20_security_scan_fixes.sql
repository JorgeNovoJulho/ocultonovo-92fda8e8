-- =====================================================================
-- 2026-06-20 — Security scan hardening (supabase_lov findings)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- Cobre 9 dos 10 achados do scanner. O #5 (profiles columns) requer
-- coordenação com o frontend e fica documentado no chat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) aura_xp_global_config — UPDATE só admin_master
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.aura_xp_global_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can update config" ON public.aura_xp_global_config';
    EXECUTE 'DROP POLICY IF EXISTS "aura_xp_global_config_update" ON public.aura_xp_global_config';
    EXECUTE 'DROP POLICY IF EXISTS "aura_xp_global_config_all" ON public.aura_xp_global_config';
    EXECUTE 'DROP POLICY IF EXISTS "aura_xp_global_config_admin_write" ON public.aura_xp_global_config';
    EXECUTE $p$
      CREATE POLICY "aura_xp_global_config_admin_write"
        ON public.aura_xp_global_config
        FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS "aura_xp_global_config_read" ON public.aura_xp_global_config';
    EXECUTE $p$
      CREATE POLICY "aura_xp_global_config_read"
        ON public.aura_xp_global_config
        FOR SELECT
        TO authenticated
        USING (true)
    $p$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2) aura_xp_interaction_config — ALL só admin_master, SELECT auth
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.aura_xp_interaction_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can manage interaction config" ON public.aura_xp_interaction_config';
    EXECUTE 'DROP POLICY IF EXISTS "aura_xp_interaction_config_all" ON public.aura_xp_interaction_config';
    EXECUTE 'DROP POLICY IF EXISTS "aura_xp_interaction_config_admin_write" ON public.aura_xp_interaction_config';
    EXECUTE $p$
      CREATE POLICY "aura_xp_interaction_config_admin_write"
        ON public.aura_xp_interaction_config
        FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS "aura_xp_interaction_config_read" ON public.aura_xp_interaction_config';
    EXECUTE $p$
      CREATE POLICY "aura_xp_interaction_config_read"
        ON public.aura_xp_interaction_config
        FOR SELECT
        TO authenticated
        USING (true)
    $p$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) oculto_master_alert_settings — has_role em vez de username
-- ---------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  IF to_regclass('public.oculto_master_alert_settings') IS NOT NULL THEN
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='oculto_master_alert_settings'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.oculto_master_alert_settings', r.policyname);
    END LOOP;

    EXECUTE $p$
      CREATE POLICY "oculto_master_alert_settings_admin_all"
        ON public.oculto_master_alert_settings
        FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4) post_dislikes — SELECT só authenticated
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.post_dislikes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view dislikes" ON public.post_dislikes';
    EXECUTE 'DROP POLICY IF EXISTS "post_dislikes_public_read" ON public.post_dislikes';
    EXECUTE 'DROP POLICY IF EXISTS "post_dislikes_select_authenticated" ON public.post_dislikes';
    EXECUTE $p$
      CREATE POLICY "post_dislikes_select_authenticated"
        ON public.post_dislikes
        FOR SELECT
        TO authenticated
        USING (true)
    $p$;
    EXECUTE 'REVOKE SELECT ON public.post_dislikes FROM anon';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 6) seed-backups bucket — INSERT só service_role
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='objects' AND relnamespace='storage'::regnamespace) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Service can insert seed backups" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "seed_backups_insert_service" ON storage.objects';
    EXECUTE $p$
      CREATE POLICY "seed_backups_insert_service"
        ON storage.objects
        FOR INSERT
        TO service_role
        WITH CHECK (bucket_id = 'seed-backups')
    $p$;

    EXECUTE 'DROP POLICY IF EXISTS "seed_backups_select_admin" ON storage.objects';
    EXECUTE $p$
      CREATE POLICY "seed_backups_select_admin"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (bucket_id = 'seed-backups' AND public.has_role(auth.uid(), 'admin_master'))
    $p$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7) story_likes / story_dislikes — SELECT só authenticated
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.story_likes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view story likes" ON public.story_likes';
    EXECUTE 'DROP POLICY IF EXISTS "story_likes_public_read" ON public.story_likes';
    EXECUTE 'DROP POLICY IF EXISTS "story_likes_select_authenticated" ON public.story_likes';
    EXECUTE $p$
      CREATE POLICY "story_likes_select_authenticated"
        ON public.story_likes
        FOR SELECT
        TO authenticated
        USING (true)
    $p$;
    EXECUTE 'REVOKE SELECT ON public.story_likes FROM anon';
  END IF;

  IF to_regclass('public.story_dislikes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view story dislikes" ON public.story_dislikes';
    EXECUTE 'DROP POLICY IF EXISTS "story_dislikes_public_read" ON public.story_dislikes';
    EXECUTE 'DROP POLICY IF EXISTS "story_dislikes_select_authenticated" ON public.story_dislikes';
    EXECUTE $p$
      CREATE POLICY "story_dislikes_select_authenticated"
        ON public.story_dislikes
        FOR SELECT
        TO authenticated
        USING (true)
    $p$;
    EXECUTE 'REVOKE SELECT ON public.story_dislikes FROM anon';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 8) support_attachments bucket — SELECT só owner (pasta=uid) ou admin
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='objects' AND relnamespace='storage'::regnamespace) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public read support attachments" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "support_attachments_public_read" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "support_attachments_owner_or_admin_read" ON storage.objects';
    EXECUTE $p$
      CREATE POLICY "support_attachments_owner_or_admin_read"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'support_attachments'
          AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR public.has_role(auth.uid(), 'admin_master')
            OR public.has_role(auth.uid(), 'admin')
          )
        )
    $p$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 9) system_settings — remove leitura pública anônima
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.system_settings') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can read settings" ON public.system_settings';
    EXECUTE 'DROP POLICY IF EXISTS "system_settings_public_read" ON public.system_settings';
    EXECUTE 'REVOKE SELECT ON public.system_settings FROM anon';

    -- garante policy filtrada para authenticated (não-sensíveis)
    EXECUTE 'DROP POLICY IF EXISTS "system_settings_auth_read_non_sensitive" ON public.system_settings';
    EXECUTE $p$
      CREATE POLICY "system_settings_auth_read_non_sensitive"
        ON public.system_settings
        FOR SELECT
        TO authenticated
        USING (
          key NOT ILIKE '%secret%'
          AND key NOT ILIKE '%api_key%'
          AND key NOT ILIKE '%token%'
          AND key NOT ILIKE '%password%'
        )
    $p$;

    EXECUTE 'DROP POLICY IF EXISTS "system_settings_admin_all" ON public.system_settings';
    EXECUTE $p$
      CREATE POLICY "system_settings_admin_all"
        ON public.system_settings
        FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin_master'))
        WITH CHECK (public.has_role(auth.uid(), 'admin_master'))
    $p$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 10) user_trust_scores — SELECT só authenticated
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.user_trust_scores') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Trust scores are viewable by everyone" ON public.user_trust_scores';
    EXECUTE 'DROP POLICY IF EXISTS "user_trust_scores_public_read" ON public.user_trust_scores';
    EXECUTE 'DROP POLICY IF EXISTS "user_trust_scores_select_authenticated" ON public.user_trust_scores';
    EXECUTE $p$
      CREATE POLICY "user_trust_scores_select_authenticated"
        ON public.user_trust_scores
        FOR SELECT
        TO authenticated
        USING (true)
    $p$;
    EXECUTE 'REVOKE SELECT ON public.user_trust_scores FROM anon';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
