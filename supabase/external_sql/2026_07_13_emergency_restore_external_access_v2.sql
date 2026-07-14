-- =====================================================================
-- 2026-07-13 — EMERGENCY RESTORE V2: feed/login/perfil/histórico
-- Banco alvo: Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente. Rodar no SQL Editor do banco externo.
--
-- Objetivo: desfazer o efeito operacional do hardening que removeu GRANTs
-- e EXECUTEs necessários para o app autenticado carregar feed, perfil,
-- stories, sessões, mensagens, notificações e histórico do usuário.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Acesso básico ao schema + coluna usada por policies recentes
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.system_settings') IS NOT NULL THEN
    ALTER TABLE public.system_settings
      ADD COLUMN IF NOT EXISTS is_sensitive boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) RPC admin compatível: NÃO recria se já existir (evita 42P13/2BP01)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'is_admin_master'
       AND oidvectortypes(p.proargtypes) = 'uuid'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.is_admin_master(_user_id uuid DEFAULT auth.uid())
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT EXISTS (
          SELECT 1
            FROM public.user_roles
           WHERE user_id = _user_id
             AND role::text IN ('admin_master','master_admin','admin')
        ) OR EXISTS (
          SELECT 1
            FROM public.profiles
           WHERE (user_id = _user_id OR id = _user_id)
             AND replace(replace(replace(lower(coalesce(username,'')), '_', ''), '-', ''), '.', '') = 'ocultomaster'
        );
      $body$;
    $fn$;
  END IF;

  BEGIN
    ALTER FUNCTION public.is_admin_master(uuid) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  GRANT EXECUTE ON FUNCTION public.is_admin_master(uuid) TO authenticated, service_role;
END $$;

-- ---------------------------------------------------------------------
-- 2) RESTAURA EXECUTE para authenticated em TODAS as funções public
--    (foi o ponto que quebrou boot/login/feed após hardening).
--    Não concede anon globalmente; anon só recebe RPCs públicas listadas.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  public_rpc text[] := ARRAY[
    'get_maintenance_state',
    'get_platform_runtime',
    'oculto_experience_settings_get',
    'welcome_metric_increment',
    'landing_public_metric_increment',
    'lookup_referral_code',
    'add_to_waitlist',
    'get_pioneer_slots_status',
    'oculto_user_public_memberships',
    'oculto_play_playlist_get',
    'oculto_play_top_by_kind',
    'oculto_play_public_preview',
    'oculto_play_guest_item',
    'oculto_play_trending_24h',
    'oculto_play_feed',
    'oculto_play_preview_window',
    'social_core_identity_get'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind IN ('f','p')
  LOOP
    BEGIN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
        r.schema_name, r.func_name, r.args
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
        r.schema_name, r.func_name, r.args
      );
      IF r.func_name = ANY(public_rpc) THEN
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO anon',
          r.schema_name, r.func_name, r.args
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip grant execute %.%(%) — %', r.schema_name, r.func_name, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- ---------------------------------------------------------------------
-- 3) GRANTs Data API para TODAS as tabelas/views do schema public
--    authenticated volta a alcançar os objetos; RLS continua filtrando linhas.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  obj record;
  public_read_objects text[] := ARRAY[
    'posts','profiles','feed_settings','platform_runtime_settings',
    'oculto_feed_modes_config','oculto_experience_settings',
    'landing_settings','site_sections','site_images',
    'post_likes','post_dislikes','post_comments','comment_likes','post_shares',
    'story_likes','story_dislikes','story_views','follows','profile_likes',
    'subscription_plans','badges','achievements','level_definitions',
    'aura_xp_global_config','aura_xp_interaction_config',
    'v_feed_posts','v_public_posts','v_secure_posts','v_public_profiles',
    'v_public_stories','v_public_followers','v_public_following',
    'v_media_play_counts','v_post_view_counts','v_active_sponsored_ads',
    'fan_rankings'
  ];
BEGIN
  FOR obj IN
    SELECT n.nspname, c.relname, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r','p','v','m')
  LOOP
    BEGIN
      IF obj.relkind IN ('r','p') THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO authenticated', obj.nspname, obj.relname);
        EXECUTE format('GRANT ALL ON %I.%I TO service_role', obj.nspname, obj.relname);
      ELSE
        EXECUTE format('GRANT SELECT ON %I.%I TO authenticated', obj.nspname, obj.relname);
        EXECUTE format('GRANT ALL ON %I.%I TO service_role', obj.nspname, obj.relname);
        IF obj.relkind = 'v' THEN
          BEGIN
            EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', obj.nspname, obj.relname);
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END IF;
      END IF;

      IF obj.relname = ANY(public_read_objects) THEN
        EXECUTE format('GRANT SELECT ON %I.%I TO anon', obj.nspname, obj.relname);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip grant object %.% — %', obj.nspname, obj.relname, SQLERRM;
    END;
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Policies mínimas/seguras para objetos que derrubam o app quando RLS
--    ficou ativo sem policy suficiente.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  post_qual text := 'true';
  has_col boolean;
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_visible_posts_anon_auth_v2" ON public.posts;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='is_hidden') INTO has_col;
    IF has_col THEN post_qual := post_qual || ' AND COALESCE(is_hidden, false) = false'; END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='privacy_level') INTO has_col;
    IF has_col THEN post_qual := post_qual || ' AND COALESCE(privacy_level, ''public'') IN (''public'',''friends'',''vip'')'; END IF;

    EXECUTE 'CREATE POLICY "restore_read_visible_posts_anon_auth_v2" ON public.posts FOR SELECT TO anon, authenticated USING (' || post_qual || ')';

    BEGIN
      DROP POLICY IF EXISTS "restore_insert_own_posts_auth_v2" ON public.posts;
      DROP POLICY IF EXISTS "restore_update_own_posts_auth_v2" ON public.posts;
      DROP POLICY IF EXISTS "restore_delete_own_posts_auth_v2" ON public.posts;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='author_id') THEN
        CREATE POLICY "restore_insert_own_posts_auth_v2"
          ON public.posts FOR INSERT TO authenticated
          WITH CHECK (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()));
        CREATE POLICY "restore_update_own_posts_auth_v2"
          ON public.posts FOR UPDATE TO authenticated
          USING (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()) OR public.is_admin_master(auth.uid()))
          WITH CHECK (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()) OR public.is_admin_master(auth.uid()));
        CREATE POLICY "restore_delete_own_posts_auth_v2"
          ON public.posts FOR DELETE TO authenticated
          USING (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()) OR public.is_admin_master(auth.uid()));
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_profiles_anon_auth_v2" ON public.profiles;
    CREATE POLICY "restore_read_profiles_anon_auth_v2"
      ON public.profiles FOR SELECT TO anon, authenticated USING (true);

    BEGIN
      DROP POLICY IF EXISTS "restore_insert_own_profile_auth_v2" ON public.profiles;
      CREATE POLICY "restore_insert_own_profile_auth_v2"
        ON public.profiles FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid() OR id = auth.uid());

      DROP POLICY IF EXISTS "restore_update_own_profile_auth_v2" ON public.profiles;
      CREATE POLICY "restore_update_own_profile_auth_v2"
        ON public.profiles FOR UPDATE TO authenticated
        USING (user_id = auth.uid() OR id = auth.uid() OR public.is_admin_master(auth.uid()))
        WITH CHECK (user_id = auth.uid() OR id = auth.uid() OR public.is_admin_master(auth.uid()));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF to_regclass('public.feed_settings') IS NOT NULL THEN
    ALTER TABLE public.feed_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_feed_settings_anon_auth_v2" ON public.feed_settings;
    CREATE POLICY "restore_read_feed_settings_anon_auth_v2"
      ON public.feed_settings FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.platform_runtime_settings') IS NOT NULL THEN
    ALTER TABLE public.platform_runtime_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_platform_runtime_anon_auth_v2" ON public.platform_runtime_settings;
    CREATE POLICY "restore_read_platform_runtime_anon_auth_v2"
      ON public.platform_runtime_settings FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.oculto_feed_modes_config') IS NOT NULL THEN
    ALTER TABLE public.oculto_feed_modes_config ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_feed_modes_enabled_anon_auth_v2" ON public.oculto_feed_modes_config;
    CREATE POLICY "restore_read_feed_modes_enabled_anon_auth_v2"
      ON public.oculto_feed_modes_config FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.system_settings') IS NOT NULL THEN
    ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_non_sensitive_system_settings_auth_v2" ON public.system_settings;
    CREATE POLICY "restore_read_non_sensitive_system_settings_auth_v2"
      ON public.system_settings FOR SELECT TO authenticated
      USING (COALESCE(is_sensitive, false) = false OR public.is_admin_master(auth.uid()));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5) Policies próprias para sessão/roles/notificações/interações essenciais
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.oculto_active_sessions') IS NOT NULL THEN
    ALTER TABLE public.oculto_active_sessions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_select_own_active_session_auth_v2" ON public.oculto_active_sessions;
    CREATE POLICY "restore_select_own_active_session_auth_v2"
      ON public.oculto_active_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
    DROP POLICY IF EXISTS "restore_insert_own_active_session_auth_v2" ON public.oculto_active_sessions;
    CREATE POLICY "restore_insert_own_active_session_auth_v2"
      ON public.oculto_active_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    DROP POLICY IF EXISTS "restore_update_own_active_session_auth_v2" ON public.oculto_active_sessions;
    CREATE POLICY "restore_update_own_active_session_auth_v2"
      ON public.oculto_active_sessions FOR UPDATE TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_select_own_roles_auth_v2" ON public.user_roles;
    CREATE POLICY "restore_select_own_roles_auth_v2"
      ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_master(auth.uid()));
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    BEGIN
      DROP POLICY IF EXISTS "restore_select_own_notifications_auth_v2" ON public.notifications;
      CREATE POLICY "restore_select_own_notifications_auth_v2"
        ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR recipient_id = auth.uid());
      DROP POLICY IF EXISTS "restore_update_own_notifications_auth_v2" ON public.notifications;
      CREATE POLICY "restore_update_own_notifications_auth_v2"
        ON public.notifications FOR UPDATE TO authenticated
        USING (user_id = auth.uid() OR recipient_id = auth.uid())
        WITH CHECK (user_id = auth.uid() OR recipient_id = auth.uid());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF to_regclass('public.post_likes') IS NOT NULL THEN
    ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_post_likes_anon_auth_v2" ON public.post_likes;
    CREATE POLICY "restore_read_post_likes_anon_auth_v2" ON public.post_likes FOR SELECT TO anon, authenticated USING (true);
    DROP POLICY IF EXISTS "restore_manage_own_post_likes_auth_v2" ON public.post_likes;
    CREATE POLICY "restore_manage_own_post_likes_auth_v2" ON public.post_likes FOR ALL TO authenticated
      USING (user_id IN (auth.uid(), (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid() LIMIT 1)))
      WITH CHECK (user_id IN (auth.uid(), (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid() LIMIT 1)));
  END IF;

  IF to_regclass('public.saved_posts') IS NOT NULL THEN
    ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_saved_posts_auth_v2" ON public.saved_posts;
    CREATE POLICY "restore_read_saved_posts_auth_v2" ON public.saved_posts FOR SELECT TO authenticated USING (true);
    DROP POLICY IF EXISTS "restore_manage_own_saved_posts_auth_v2" ON public.saved_posts;
    CREATE POLICY "restore_manage_own_saved_posts_auth_v2" ON public.saved_posts FOR ALL TO authenticated
      USING (user_id IN (auth.uid(), (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid() LIMIT 1)))
      WITH CHECK (user_id IN (auth.uid(), (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid() LIMIT 1)));
  END IF;

  IF to_regclass('public.story_views') IS NOT NULL THEN
    ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
    BEGIN
      DROP POLICY IF EXISTS "restore_read_own_story_views_auth_v2" ON public.story_views;
      CREATE POLICY "restore_read_own_story_views_auth_v2" ON public.story_views FOR SELECT TO authenticated USING (viewer_id = auth.uid());
      DROP POLICY IF EXISTS "restore_insert_own_story_views_auth_v2" ON public.story_views;
      CREATE POLICY "restore_insert_own_story_views_auth_v2" ON public.story_views FOR INSERT TO authenticated WITH CHECK (viewer_id = auth.uid());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 6) Realtime/publication: restaura eventos do feed e sessões sem abortar
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      CREATE PUBLICATION supabase_realtime;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'posts','profiles','post_likes','post_dislikes','post_comments','comment_likes',
    'saved_posts','post_shares','story_views','story_likes','story_dislikes',
    'notifications','admin_notifications','platform_runtime_settings',
    'oculto_feed_modes_config','oculto_user_experience_preferences',
    'oculto_active_sessions','messages','conversations','conversation_participants',
    'typing_indicators','follows','profile_likes','events','event_rsvps'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      BEGIN
        EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN duplicate_object OR insufficient_privilege OR undefined_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- VERIFICAÇÃO OPCIONAL
-- ---------------------------------------------------------------------
SELECT table_schema, table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN (
     'posts','profiles','v_feed_posts','v_public_profiles','feed_settings',
     'platform_runtime_settings','oculto_feed_modes_config','notifications',
     'messages','conversations','oculto_active_sessions'
   )
   AND grantee IN ('anon','authenticated')
 ORDER BY table_name, grantee, privilege_type;
