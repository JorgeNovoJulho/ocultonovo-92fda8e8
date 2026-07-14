-- =====================================================================
-- 2026-06-17 — Correções dos achados do Security Scan
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
--
-- Cobre:
--   1) aura_xp_global_config        — UPDATE só admin_master
--   2) aura_xp_interaction_config   — ALL só admin_master
--   3) oculto_master_alert_settings — substitui username por has_role
--   4) post_dislikes                — SELECT só authenticated
--   5) story_likes / story_dislikes — SELECT só authenticated
--   6) user_trust_scores            — SELECT só authenticated
--   7) system_settings              — remove SELECT público anônimo
--   8) Storage seed-backups         — INSERT só service_role/admin_master
--   9) Storage support_attachments  — SELECT só dono(folder=auth.uid)/admin
--
-- NÃO inclui o hardening de colunas sensíveis de `profiles` — isso exige
-- refactor de frontend (criar view pública + RPC do dono). Tratar em
-- migration separada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) aura_xp_global_config — UPDATE somente admin_master
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='aura_xp_global_config') THEN
    -- remove qualquer policy permissiva existente de UPDATE/ALL/INSERT/DELETE
    FOR r IN (
      SELECT policyname FROM pg_policies
       WHERE schemaname='public' AND tablename='aura_xp_global_config'
         AND cmd IN ('UPDATE','ALL','INSERT','DELETE')
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.aura_xp_global_config', r.policyname);
    END LOOP;

    EXECUTE 'ALTER TABLE public.aura_xp_global_config ENABLE ROW LEVEL SECURITY';

    -- SELECT continua liberado p/ authenticated (config global lida pelo app)
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname='public' AND tablename='aura_xp_global_config'
                       AND policyname='aura_xp_global_config_select_auth') THEN
      EXECUTE 'CREATE POLICY "aura_xp_global_config_select_auth"
                 ON public.aura_xp_global_config FOR SELECT TO authenticated USING (true)';
    END IF;

    EXECUTE 'CREATE POLICY "aura_xp_global_config_admin_write"
               ON public.aura_xp_global_config FOR ALL TO authenticated
               USING (public.has_role(auth.uid(), ''admin_master''::app_role))
               WITH CHECK (public.has_role(auth.uid(), ''admin_master''::app_role))';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2) aura_xp_interaction_config — ALL somente admin_master
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='aura_xp_interaction_config') THEN
    FOR r IN (
      SELECT policyname FROM pg_policies
       WHERE schemaname='public' AND tablename='aura_xp_interaction_config'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.aura_xp_interaction_config', r.policyname);
    END LOOP;

    EXECUTE 'ALTER TABLE public.aura_xp_interaction_config ENABLE ROW LEVEL SECURITY';

    EXECUTE 'CREATE POLICY "aura_xp_interaction_config_select_auth"
               ON public.aura_xp_interaction_config FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "aura_xp_interaction_config_admin_write"
               ON public.aura_xp_interaction_config FOR ALL TO authenticated
               USING (public.has_role(auth.uid(), ''admin_master''::app_role))
               WITH CHECK (public.has_role(auth.uid(), ''admin_master''::app_role))';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) oculto_master_alert_settings — usar has_role em vez de username
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='oculto_master_alert_settings') THEN
    FOR r IN (
      SELECT policyname FROM pg_policies
       WHERE schemaname='public' AND tablename='oculto_master_alert_settings'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.oculto_master_alert_settings', r.policyname);
    END LOOP;

    EXECUTE 'ALTER TABLE public.oculto_master_alert_settings ENABLE ROW LEVEL SECURITY';

    EXECUTE 'CREATE POLICY "oculto_master_alert_settings_admin_all"
               ON public.oculto_master_alert_settings FOR ALL TO authenticated
               USING (public.has_role(auth.uid(), ''admin_master''::app_role))
               WITH CHECK (public.has_role(auth.uid(), ''admin_master''::app_role))';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4) post_dislikes — SELECT apenas authenticated
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='post_dislikes') THEN
    FOR r IN (
      SELECT policyname FROM pg_policies
       WHERE schemaname='public' AND tablename='post_dislikes' AND cmd='SELECT'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.post_dislikes', r.policyname);
    END LOOP;

    EXECUTE 'CREATE POLICY "post_dislikes_select_auth"
               ON public.post_dislikes FOR SELECT TO authenticated USING (true)';

    -- revoga anon
    REVOKE SELECT ON public.post_dislikes FROM anon;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5) story_likes / story_dislikes — SELECT apenas authenticated
-- ---------------------------------------------------------------------
DO $$
DECLARE r record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['story_likes','story_dislikes'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      FOR r IN EXECUTE format(
        'SELECT policyname FROM pg_policies WHERE schemaname=''public'' AND tablename=%L AND cmd=''SELECT''', t
      ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      END LOOP;
      EXECUTE format('CREATE POLICY "%s_select_auth" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
      EXECUTE format('REVOKE SELECT ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6) user_trust_scores — SELECT apenas authenticated
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='user_trust_scores') THEN
    FOR r IN (
      SELECT policyname FROM pg_policies
       WHERE schemaname='public' AND tablename='user_trust_scores' AND cmd='SELECT'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_trust_scores', r.policyname);
    END LOOP;
    EXECUTE 'CREATE POLICY "user_trust_scores_select_auth"
               ON public.user_trust_scores FOR SELECT TO authenticated USING (true)';
    REVOKE SELECT ON public.user_trust_scores FROM anon;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7) system_settings — remove SELECT público anônimo
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='system_settings') THEN
    -- drop policies de SELECT que sejam abertas (true) para anon/public
    FOR r IN (
      SELECT policyname FROM pg_policies
       WHERE schemaname='public' AND tablename='system_settings' AND cmd='SELECT'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_settings', r.policyname);
    END LOOP;

    -- policy filtrada para authenticated (esconde chaves sensíveis)
    EXECUTE $p$
      CREATE POLICY "system_settings_select_auth_filtered"
        ON public.system_settings FOR SELECT TO authenticated
        USING (
          key IS NULL OR (
            key NOT ILIKE '%secret%'
            AND key NOT ILIKE '%api_key%'
            AND key NOT ILIKE '%token%'
            AND key NOT ILIKE '%password%'
          )
        )
    $p$;

    -- policy completa para admin_master
    EXECUTE 'CREATE POLICY "system_settings_admin_all"
               ON public.system_settings FOR ALL TO authenticated
               USING (public.has_role(auth.uid(), ''admin_master''::app_role))
               WITH CHECK (public.has_role(auth.uid(), ''admin_master''::app_role))';

    REVOKE SELECT ON public.system_settings FROM anon;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 8) Storage bucket `seed-backups` — INSERT só service_role/admin_master
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT policyname FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects'
       AND (qual ILIKE '%seed-backups%' OR with_check ILIKE '%seed-backups%')
       AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;

  EXECUTE 'CREATE POLICY "seed_backups_admin_write"
             ON storage.objects FOR ALL TO authenticated
             USING (bucket_id = ''seed-backups'' AND public.has_role(auth.uid(), ''admin_master''::app_role))
             WITH CHECK (bucket_id = ''seed-backups'' AND public.has_role(auth.uid(), ''admin_master''::app_role))';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'seed-backups policy block: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------
-- 9) Storage bucket `support_attachments` — SELECT só dono/admin
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT policyname FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects'
       AND (qual ILIKE '%support_attachments%' OR with_check ILIKE '%support_attachments%')
       AND cmd='SELECT'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;

  EXECUTE 'CREATE POLICY "support_attachments_select_owner_or_admin"
             ON storage.objects FOR SELECT TO authenticated
             USING (
               bucket_id = ''support_attachments''
               AND (
                 (storage.foldername(name))[1] = auth.uid()::text
                 OR public.has_role(auth.uid(), ''admin_master''::app_role)
               )
             )';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'support_attachments policy block: %', SQLERRM;
END $$;

-- Recarrega cache do PostgREST
NOTIFY pgrst, 'reload schema';
