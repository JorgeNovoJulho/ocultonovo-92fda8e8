-- RESTAURAÇÃO EMERGENCIAL — feed/stories/sessões em branco após hardening agressivo
-- Banco: Supabase EXTERNO (rvybbrkzmboqbhcemqar.supabase.co)
-- Idempotente: pode rodar mais de uma vez.
-- Objetivo:
-- 1) devolver EXECUTE às RPCs usadas no boot/login/feed;
-- 2) garantir SELECT nas views/tabelas críticas do feed/stories;
-- 3) recriar policies mínimas para leitura do feed e preferências do usuário;
-- 4) recarregar o schema cache do PostgREST.

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Compatibilidade de system_settings pós-hardening anterior
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    ALTER TABLE public.system_settings
      ADD COLUMN IF NOT EXISTS is_sensitive boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Restaura EXECUTE de RPCs públicas/boot
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  anon_rpc text[] := ARRAY[
    -- Boot/landing/login: falhar aqui quebra a hidratação inicial do app
    'get_maintenance_state',
    'get_platform_runtime',
    'oculto_experience_settings_get',
    'welcome_metric_increment',
    -- Fluxos públicos existentes
    'lookup_referral_code',
    'add_to_waitlist',
    'get_pioneer_slots_status',
    'oculto_user_public_memberships',
    'oculto_play_playlist_get',
    'oculto_play_top_by_kind',
    'oculto_play_public_preview',
    'oculto_play_guest_item',
    'oculto_play_trending_24h'
  ];
  auth_rpc text[] := ARRAY[
    -- Auth/roles/login
    'has_role',
    'is_admin',
    'is_admin_master',
    'ensure_my_profile',
    'increment_login_count',
    -- sessão única
    'claim_active_session',
    -- modos/sessões do feed
    'set_feed_mode',
    'set_feed_widgets_custom',
    'log_feed_mode_event',
    'log_view_mode_event',
    -- identidade/social/feed auxiliares
    'social_core_identity_get',
    'record_profile_visit',
    'oculto_experience_settings_get',
    -- chat/blocks básicos usados após login
    'is_chat_blocked_between'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (
         p.proname = ANY (anon_rpc)
         OR p.proname = ANY (auth_rpc)
       )
  LOOP
    BEGIN
      IF r.proname = ANY (anon_rpc) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO anon, authenticated', r.nspname, r.proname, r.args);
      ELSE
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.nspname, r.proname, r.args);
      END IF;
      EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role', r.nspname, r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN
      -- Não interrompe se alguma função tiver assinatura/owner especial.
      NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2) Views críticas do feed/stories/perfis: SELECT + security_invoker
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  critical_views text[] := ARRAY[
    'v_feed_posts',
    'v_public_posts',
    'v_secure_posts',
    'v_public_profiles',
    'v_public_stories',
    'v_public_followers',
    'v_public_following',
    'v_media_play_counts',
    'v_post_view_counts',
    'v_active_sponsored_ads',
    'fan_rankings',
    'vw_extrato_criador'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('v','m')
       AND c.relname = ANY (critical_views)
  LOOP
    BEGIN
      IF r.relkind = 'v' THEN
        EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.nspname, r.relname);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      EXECUTE format('GRANT SELECT ON %I.%I TO anon, authenticated', r.nspname, r.relname);
      EXECUTE format('GRANT ALL ON %I.%I TO service_role', r.nspname, r.relname);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3) GRANTs das tabelas que alimentam o feed/stories/boot
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  public_read_tables text[] := ARRAY[
    'posts',
    'profiles',
    'feed_settings',
    'platform_runtime_settings',
    'oculto_feed_modes_config',
    'oculto_experience_settings',
    'system_settings',
    'post_likes',
    'post_dislikes',
    'post_comments',
    'saved_posts',
    'post_shares',
    'story_views'
  ];
  auth_crud_tables text[] := ARRAY[
    'oculto_user_experience_preferences',
    'oculto_active_sessions',
    'user_roles',
    'notification_preferences',
    'user_notification_preferences'
  ];
BEGIN
  FOREACH t IN ARRAY public_read_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      BEGIN
        EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY auth_crud_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      BEGIN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4) Policies de restauração para leitura do feed/perfis/settings
--    Não apaga policies existentes; só adiciona fail-safe com nomes próprios.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_public_read_visible_posts" ON public.posts;
    CREATE POLICY "restore_public_read_visible_posts"
      ON public.posts
      FOR SELECT
      TO anon, authenticated
      USING (
        COALESCE(is_hidden, false) = false
        AND COALESCE(privacy_level, 'public') = 'public'
      );
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_public_read_profiles" ON public.profiles;
    CREATE POLICY "restore_public_read_profiles"
      ON public.profiles
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF to_regclass('public.feed_settings') IS NOT NULL THEN
    ALTER TABLE public.feed_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_public_read_feed_settings" ON public.feed_settings;
    CREATE POLICY "restore_public_read_feed_settings"
      ON public.feed_settings
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF to_regclass('public.platform_runtime_settings') IS NOT NULL THEN
    ALTER TABLE public.platform_runtime_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_public_read_platform_runtime" ON public.platform_runtime_settings;
    CREATE POLICY "restore_public_read_platform_runtime"
      ON public.platform_runtime_settings
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF to_regclass('public.oculto_feed_modes_config') IS NOT NULL THEN
    ALTER TABLE public.oculto_feed_modes_config ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_public_read_feed_modes_config" ON public.oculto_feed_modes_config;
    CREATE POLICY "restore_public_read_feed_modes_config"
      ON public.oculto_feed_modes_config
      FOR SELECT
      TO authenticated
      USING (enabled = true);
  END IF;

  IF to_regclass('public.system_settings') IS NOT NULL THEN
    ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_public_read_non_sensitive_system_settings" ON public.system_settings;
    CREATE POLICY "restore_public_read_non_sensitive_system_settings"
      ON public.system_settings
      FOR SELECT
      TO anon, authenticated
      USING (COALESCE(is_sensitive, false) = false);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5) Policies próprias do usuário — preferências e sessão única
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.oculto_user_experience_preferences') IS NOT NULL THEN
    ALTER TABLE public.oculto_user_experience_preferences ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "restore_user_can_select_own_experience_preferences" ON public.oculto_user_experience_preferences;
    CREATE POLICY "restore_user_can_select_own_experience_preferences"
      ON public.oculto_user_experience_preferences
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());

    DROP POLICY IF EXISTS "restore_user_can_insert_own_experience_preferences" ON public.oculto_user_experience_preferences;
    CREATE POLICY "restore_user_can_insert_own_experience_preferences"
      ON public.oculto_user_experience_preferences
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "restore_user_can_update_own_experience_preferences" ON public.oculto_user_experience_preferences;
    CREATE POLICY "restore_user_can_update_own_experience_preferences"
      ON public.oculto_user_experience_preferences
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF to_regclass('public.oculto_active_sessions') IS NOT NULL THEN
    ALTER TABLE public.oculto_active_sessions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "restore_user_can_select_own_active_session" ON public.oculto_active_sessions;
    CREATE POLICY "restore_user_can_select_own_active_session"
      ON public.oculto_active_sessions
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());

    DROP POLICY IF EXISTS "restore_user_can_insert_own_active_session" ON public.oculto_active_sessions;
    CREATE POLICY "restore_user_can_insert_own_active_session"
      ON public.oculto_active_sessions
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "restore_user_can_update_own_active_session" ON public.oculto_active_sessions;
    CREATE POLICY "restore_user_can_update_own_active_session"
      ON public.oculto_active_sessions
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_user_can_read_own_roles" ON public.user_roles;
    CREATE POLICY "restore_user_can_read_own_roles"
      ON public.user_roles
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 6) Realtime/publication — não falhar se o owner não permitir ALTER PUBLICATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'posts', 'profiles', 'post_likes', 'post_dislikes', 'post_comments',
    'saved_posts', 'post_shares', 'story_views',
    'platform_runtime_settings', 'oculto_feed_modes_config',
    'oculto_user_experience_preferences', 'oculto_active_sessions'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN duplicate_object OR insufficient_privilege OR undefined_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Recarrega o cache do PostgREST/Data API.
NOTIFY pgrst, 'reload schema';