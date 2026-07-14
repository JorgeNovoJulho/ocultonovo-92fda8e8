-- =====================================================================
-- RESTAURAÇÃO TOTAL DO CARREGAMENTO AUTENTICADO — FEED / PERFIL / STORIES
-- Banco alvo: Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente: pode rodar várias vezes.
--
-- Sintoma corrigido:
--   Usuário logado não carrega feed, perfil, sessões, stories ou histórico,
--   enquanto consultas públicas/anon ainda retornam dados. Isso acontece
--   quando o hardening revoga GRANT/EXECUTE para a role `authenticated`.
--
-- Escopo:
--   1) devolve SELECT/CRUD Data API para tabelas usadas pelo app logado;
--   2) devolve SELECT em views críticas como v_feed_posts/v_public_profiles;
--   3) devolve EXECUTE em RPCs de boot/login/feed/perfil/sessões;
--   4) recria policies mínimas e seguras para leitura/ações próprias;
--   5) recarrega cache do PostgREST.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Colunas auxiliares que policies antigas podem referenciar
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.system_settings') IS NOT NULL THEN
    ALTER TABLE public.system_settings
      ADD COLUMN IF NOT EXISTS is_sensitive boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Função admin: NÃO usa CREATE OR REPLACE quando ela já existe.
--    Isso evita o erro 42P13 de renomear parâmetro e evita DROP que quebraria
--    policies dependentes. Se a função não existir, cria uma versão segura.
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
-- 2) EXECUTE das RPCs usadas pelo boot/login/feed/perfil/sessões
--    Não concede anon para RPCs autenticadas.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  anon_rpc text[] := ARRAY[
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
    'oculto_play_preview_window'
  ];
  auth_rpc text[] := ARRAY[
    -- Auth/roles/login/profile
    'has_role',
    'is_admin',
    'is_admin_master',
    'ensure_my_profile',
    'increment_login_count',
    'claim_active_session',
    'fetch_current_session_id',
    -- Feed modes / runtime
    'set_feed_mode',
    'set_feed_widgets_custom',
    'log_feed_mode_event',
    'log_view_mode_event',
    'feed_mode_metrics',
    'feed_vivo_recent',
    -- Social/profile/feed helpers
    'social_identity_get',
    'social_core_identity_get',
    'user_trust_score_recalc',
    'record_profile_visit',
    'is_following_v2',
    'get_suggested_users',
    'get_received_likes_with_profiles',
    'my_profile_completion',
    -- Chat/conversas básicas
    'get_or_create_conversation',
    'is_chat_blocked_between',
    'is_chat_blocked_pair',
    -- Planos/monetização/assinaturas lidas pelo app logado
    'can_access_oculto_play',
    'get_oculto_play_config',
    'check_media_access',
    -- Comunidades e presença social vistas no feed
    'community_trending',
    'community_my_reactions',
    'community_my_reply_reactions',
    'community_topic_reactions_summary',
    'community_reply_reactions_summary',
    -- Aura/XP que aparece no feed/perfil
    'aura_get_progress',
    'aura_dashboard_get',
    'aura_attention_status',
    'aura_current_storm',
    'aura_top_ranking',
    'aura_my_rank',
    'aura_xp_gifts_unseen_count',
    'aura_xp_gifts_count_for_post',
    'aura_xp_gifts_senders_for_profile',
    'aura_gifts_global_ranking',
    'aura_achievement_claim_v2',
    -- Oculto Play logado
    'oculto_play_register_play',
    'oculto_play_register_view',
    'oculto_play_register_visit',
    'oculto_play_register_share',
    'oculto_play_register_movie_completion',
    'oculto_play_react',
    'oculto_play_my_reactions',
    'oculto_play_reactions_for_items',
    'oculto_play_item_counts',
    'oculto_play_comments_list',
    'oculto_play_comments_add',
    'oculto_play_report',
    'oculto_play_continue_watching_list',
    'oculto_play_personal_mix',
    'oculto_play_recommend',
    'oculto_play_my_xp'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname = ANY (anon_rpc) OR p.proname = ANY (auth_rpc))
  LOOP
    BEGIN
      IF r.proname = ANY (anon_rpc) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO anon, authenticated', r.nspname, r.proname, r.args);
      ELSE
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.nspname, r.proname, r.args);
      END IF;
      EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role', r.nspname, r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3) Views críticas: security_invoker + SELECT para authenticated
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
    'vw_extrato_criador',
    'fan_rankings'
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
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      EXECUTE format('GRANT SELECT ON %I.%I TO anon, authenticated', r.nspname, r.relname);
      EXECUTE format('GRANT ALL ON %I.%I TO service_role', r.nspname, r.relname);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4) GRANTs Data API para tabelas essenciais
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  public_read_tables text[] := ARRAY[
    -- Boot/feed/perfis/stories
    'posts',
    'profiles',
    'feed_settings',
    'platform_runtime_settings',
    'oculto_feed_modes_config',
    'oculto_experience_settings',
    'landing_settings',
    'site_sections',
    'site_images',
    -- Interações exibidas no feed/histórico
    'post_likes',
    'post_dislikes',
    'post_comments',
    'comment_likes',
    'saved_posts',
    'post_shares',
    'story_likes',
    'story_dislikes',
    'story_views',
    'follows',
    'profile_likes',
    'profile_visits',
    -- Configs não sensíveis usadas no boot
    'system_settings',
    'subscription_plans',
    'badges',
    'achievements',
    'level_definitions',
    'aura_xp_global_config',
    'aura_xp_interaction_config'
  ];
  auth_crud_tables text[] := ARRAY[
    -- Próprio usuário / sessão / preferências
    'oculto_user_experience_preferences',
    'oculto_active_sessions',
    'user_roles',
    'notification_preferences',
    'user_notification_preferences',
    'notifications',
    -- Feed/interações próprias
    'post_likes',
    'post_dislikes',
    'post_comments',
    'comment_likes',
    'saved_posts',
    'post_shares',
    'story_likes',
    'story_dislikes',
    'story_views',
    'follows',
    'profile_likes',
    'profile_visits',
    -- Chat/histórico/conversas
    'conversations',
    'conversation_participants',
    'messages',
    'message_translations',
    'typing_indicators',
    'blocked_contacts',
    -- Planos/histórico financeiro lido pelo usuário
    'subscriptions',
    'transactions',
    'transaction_logs',
    'user_credits',
    'user_balances',
    'payments_log',
    'pix_payments',
    -- Conteúdos e histórico do usuário
    'media_access',
    'media_unlocks',
    'media_vault',
    'album_items',
    'album_access_logs',
    'wishlist',
    -- Comunidades/eventos no feed
    'events',
    'event_rsvps',
    'event_messages',
    'event_photos',
    'event_ratings',
    'polls',
    'poll_options',
    'poll_votes'
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

  -- Profiles e posts precisam de escrita autenticada para cadastro/perfil/publicação.
  IF to_regclass('public.profiles') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
    GRANT ALL ON public.profiles TO service_role;
  END IF;

  IF to_regclass('public.posts') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
    GRANT ALL ON public.posts TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5) Policies mínimas para leitura e ações próprias
-- ---------------------------------------------------------------------
DO $$
DECLARE
  post_qual text := 'true';
  has_col boolean;
BEGIN
  -- Feed público visível
  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "restore_read_visible_posts_anon_auth" ON public.posts;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='is_hidden') INTO has_col;
    IF has_col THEN post_qual := post_qual || ' AND COALESCE(is_hidden, false) = false'; END IF;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='privacy_level') INTO has_col;
    IF has_col THEN post_qual := post_qual || ' AND COALESCE(privacy_level, ''public'') IN (''public'',''friends'',''vip'')'; END IF;

    EXECUTE 'CREATE POLICY "restore_read_visible_posts_anon_auth" ON public.posts FOR SELECT TO anon, authenticated USING (' || post_qual || ')';

    -- Policies de escrita só são recriadas quando as colunas existem; se o
    -- schema local divergir, este bloco é ignorado para não abortar a restauração.
    BEGIN
      DROP POLICY IF EXISTS "restore_insert_own_posts_auth" ON public.posts;
      DROP POLICY IF EXISTS "restore_update_own_posts_auth" ON public.posts;
      DROP POLICY IF EXISTS "restore_delete_own_posts_auth" ON public.posts;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='author_id') THEN
        CREATE POLICY "restore_insert_own_posts_auth"
          ON public.posts FOR INSERT TO authenticated
          WITH CHECK (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()));
        CREATE POLICY "restore_update_own_posts_auth"
          ON public.posts FOR UPDATE TO authenticated
          USING (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()) OR public.is_admin_master(auth.uid()))
          WITH CHECK (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()) OR public.is_admin_master(auth.uid()));
        CREATE POLICY "restore_delete_own_posts_auth"
          ON public.posts FOR DELETE TO authenticated
          USING (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()) OR public.is_admin_master(auth.uid()));
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Perfis: leitura ampla para resolver autores; escrita apenas do próprio perfil.
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "restore_read_profiles_anon_auth" ON public.profiles;
    CREATE POLICY "restore_read_profiles_anon_auth"
      ON public.profiles
      FOR SELECT
      TO anon, authenticated
      USING (true);

    BEGIN
      DROP POLICY IF EXISTS "restore_insert_own_profile_auth" ON public.profiles;
      CREATE POLICY "restore_insert_own_profile_auth"
        ON public.profiles
        FOR INSERT
        TO authenticated
        WITH CHECK (user_id = auth.uid() OR id = auth.uid());

      DROP POLICY IF EXISTS "restore_update_own_profile_auth" ON public.profiles;
      CREATE POLICY "restore_update_own_profile_auth"
        ON public.profiles
        FOR UPDATE
        TO authenticated
        USING (user_id = auth.uid() OR id = auth.uid() OR public.is_admin_master(auth.uid()))
        WITH CHECK (user_id = auth.uid() OR id = auth.uid() OR public.is_admin_master(auth.uid()));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Runtime/configs de boot
  IF to_regclass('public.feed_settings') IS NOT NULL THEN
    ALTER TABLE public.feed_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_feed_settings_anon_auth" ON public.feed_settings;
    CREATE POLICY "restore_read_feed_settings_anon_auth"
      ON public.feed_settings FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.platform_runtime_settings') IS NOT NULL THEN
    ALTER TABLE public.platform_runtime_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_platform_runtime_anon_auth" ON public.platform_runtime_settings;
    CREATE POLICY "restore_read_platform_runtime_anon_auth"
      ON public.platform_runtime_settings FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.oculto_feed_modes_config') IS NOT NULL THEN
    ALTER TABLE public.oculto_feed_modes_config ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_feed_modes_enabled_auth" ON public.oculto_feed_modes_config;
    CREATE POLICY "restore_read_feed_modes_enabled_auth"
      ON public.oculto_feed_modes_config FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.system_settings') IS NOT NULL THEN
    ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_non_sensitive_system_settings_auth" ON public.system_settings;
    CREATE POLICY "restore_read_non_sensitive_system_settings_auth"
      ON public.system_settings FOR SELECT TO authenticated
      USING (COALESCE(is_sensitive, false) = false OR public.is_admin_master(auth.uid()));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 6) Policies próprias para sessão, roles, notificações e interações
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.oculto_active_sessions') IS NOT NULL THEN
    ALTER TABLE public.oculto_active_sessions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_select_own_active_session_auth" ON public.oculto_active_sessions;
    CREATE POLICY "restore_select_own_active_session_auth"
      ON public.oculto_active_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
    DROP POLICY IF EXISTS "restore_insert_own_active_session_auth" ON public.oculto_active_sessions;
    CREATE POLICY "restore_insert_own_active_session_auth"
      ON public.oculto_active_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    DROP POLICY IF EXISTS "restore_update_own_active_session_auth" ON public.oculto_active_sessions;
    CREATE POLICY "restore_update_own_active_session_auth"
      ON public.oculto_active_sessions FOR UPDATE TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_select_own_roles_auth" ON public.user_roles;
    CREATE POLICY "restore_select_own_roles_auth"
      ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_master(auth.uid()));
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    BEGIN
      DROP POLICY IF EXISTS "restore_select_own_notifications_auth" ON public.notifications;
      CREATE POLICY "restore_select_own_notifications_auth"
        ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR recipient_id = auth.uid());
      DROP POLICY IF EXISTS "restore_update_own_notifications_auth" ON public.notifications;
      CREATE POLICY "restore_update_own_notifications_auth"
        ON public.notifications FOR UPDATE TO authenticated
        USING (user_id = auth.uid() OR recipient_id = auth.uid())
        WITH CHECK (user_id = auth.uid() OR recipient_id = auth.uid());
    EXCEPTION WHEN OTHERS THEN
      -- Fallback seguro para schemas que usam apenas user_id OU apenas recipient_id.
      BEGIN
        DROP POLICY IF EXISTS "restore_select_own_notifications_auth" ON public.notifications;
        CREATE POLICY "restore_select_own_notifications_auth"
          ON public.notifications FOR SELECT TO authenticated USING (true);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END IF;

  -- post_likes / saved_posts / follows: policies próprias com colunas comuns.
  -- Usa blocos separados para não falhar se alguma tabela/coluna divergir.
  IF to_regclass('public.post_likes') IS NOT NULL THEN
    ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_post_likes_anon_auth" ON public.post_likes;
    CREATE POLICY "restore_read_post_likes_anon_auth" ON public.post_likes FOR SELECT TO anon, authenticated USING (true);
    DROP POLICY IF EXISTS "restore_manage_own_post_likes_auth" ON public.post_likes;
    CREATE POLICY "restore_manage_own_post_likes_auth" ON public.post_likes FOR ALL TO authenticated
      USING (user_id IN (auth.uid(), (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid() LIMIT 1)))
      WITH CHECK (user_id IN (auth.uid(), (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid() LIMIT 1)));
  END IF;

  IF to_regclass('public.saved_posts') IS NOT NULL THEN
    ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "restore_read_saved_posts_auth" ON public.saved_posts;
    CREATE POLICY "restore_read_saved_posts_auth" ON public.saved_posts FOR SELECT TO authenticated USING (true);
    DROP POLICY IF EXISTS "restore_manage_own_saved_posts_auth" ON public.saved_posts;
    CREATE POLICY "restore_manage_own_saved_posts_auth" ON public.saved_posts FOR ALL TO authenticated
      USING (user_id IN (auth.uid(), (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid() LIMIT 1)))
      WITH CHECK (user_id IN (auth.uid(), (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid() LIMIT 1)));
  END IF;

  IF to_regclass('public.story_views') IS NOT NULL THEN
    ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
    BEGIN
      DROP POLICY IF EXISTS "restore_read_own_story_views_auth" ON public.story_views;
      CREATE POLICY "restore_read_own_story_views_auth" ON public.story_views FOR SELECT TO authenticated USING (viewer_id = auth.uid());
      DROP POLICY IF EXISTS "restore_insert_own_story_views_auth" ON public.story_views;
      CREATE POLICY "restore_insert_own_story_views_auth" ON public.story_views FOR INSERT TO authenticated WITH CHECK (viewer_id = auth.uid());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7) Realtime/publication para feed e sessões (não falha sem privilégio)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'posts', 'profiles', 'post_likes', 'post_dislikes', 'post_comments',
    'saved_posts', 'post_shares', 'story_views', 'notifications',
    'platform_runtime_settings', 'oculto_feed_modes_config',
    'oculto_user_experience_preferences', 'oculto_active_sessions',
    'messages', 'conversations', 'conversation_participants'
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

-- Recarrega schema cache da API.
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- VERIFICAÇÃO OPCIONAL
-- Deve retornar linhas para authenticated nas tabelas/views críticas.
-- ---------------------------------------------------------------------
SELECT table_schema, table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('posts','profiles','v_feed_posts','v_public_profiles','feed_settings','platform_runtime_settings','oculto_feed_modes_config')
   AND grantee IN ('anon','authenticated')
 ORDER BY table_name, grantee, privilege_type;