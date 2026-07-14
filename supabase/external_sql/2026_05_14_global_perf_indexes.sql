-- =====================================================================
-- 2026_05_14_global_perf_indexes.sql  (HOTFIX v2)
-- Índices de performance — agora com guarda por coluna (column exists).
-- 100% idempotente. Não falha se faltar user_id, author_id, is_flash etc.
-- =====================================================================

DO $$
BEGIN
  -- ── POSTS ────────────────────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='posts') THEN

    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='created_at')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='is_hidden') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_feed_recent ON public.posts (created_at DESC) WHERE is_hidden = false';
    END IF;

    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='author_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_author_created ON public.posts (author_id, created_at DESC)';
    END IF;

    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='user_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_user_created ON public.posts (user_id, created_at DESC)';
    END IF;

    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='is_seed')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='is_hidden') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_seed_hidden ON public.posts (is_seed, is_hidden, created_at DESC)';
    END IF;

    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='privacy_level')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='is_hidden') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_privacy ON public.posts (privacy_level, created_at DESC) WHERE is_hidden = false';
    END IF;

    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='is_flash')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='is_hidden') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_flash_active ON public.posts (created_at DESC) WHERE is_flash = true AND is_hidden = false';
    END IF;
  END IF;

  -- ── POST INTERACTIONS ────────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_likes') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_likes' AND column_name='post_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_likes_post ON public.post_likes (post_id)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_likes' AND column_name='user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_likes_user ON public.post_likes (user_id)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_likes' AND column_name='post_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_likes' AND column_name='user_id') THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_post_likes_post_user ON public.post_likes (post_id, user_id)';
    END IF;
  END IF;

  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_comments') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_comments' AND column_name='post_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_comments' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_comments_post_created ON public.post_comments (post_id, created_at DESC)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_comments' AND column_name='user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_comments_user ON public.post_comments (user_id)';
    END IF;
  END IF;

  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_dislikes') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_dislikes' AND column_name='post_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_dislikes_post ON public.post_dislikes (post_id)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_dislikes' AND column_name='user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_dislikes_user ON public.post_dislikes (user_id)';
    END IF;
  END IF;

  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='saved_posts') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_posts' AND column_name='user_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_posts' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_saved_posts_user_created ON public.saved_posts (user_id, created_at DESC)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_posts' AND column_name='post_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_saved_posts_post ON public.saved_posts (post_id)';
    END IF;
  END IF;

  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_shares') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_shares' AND column_name='post_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_shares_post ON public.post_shares (post_id)';
    END IF;
  END IF;

  -- ── PROFILES ─────────────────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='username') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (lower(username)) WHERE username IS NOT NULL';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_seed')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_seed_created ON public.profiles (is_seed, created_at DESC)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='location_lat')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='location_lng') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_geo_active ON public.profiles (location_lat, location_lng) WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='plan_type') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_plan_type ON public.profiles (plan_type) WHERE plan_type IS NOT NULL';
    END IF;
  END IF;

  -- ── MENSAGENS / CHAT ─────────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='messages') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='conversation_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages (conversation_id, created_at DESC)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='sender_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages (sender_id)';
    END IF;
  END IF;

  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='conversations') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='conversations' AND column_name='updated_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_conversations_updated ON public.conversations (updated_at DESC)';
    END IF;
  END IF;

  -- ── AURA ROOMS ───────────────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='aura_room_messages') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='aura_room_messages' AND column_name='room_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='aura_room_messages' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_aura_room_msg_room_created ON public.aura_room_messages (room_id, created_at DESC)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='aura_room_messages' AND column_name='user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_aura_room_msg_user ON public.aura_room_messages (user_id)';
    END IF;
  END IF;

  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='aura_room_participants') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='aura_room_participants' AND column_name='room_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_aura_room_part_room ON public.aura_room_participants (room_id)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='aura_room_participants' AND column_name='user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_aura_room_part_user ON public.aura_room_participants (user_id)';
    END IF;
  END IF;

  -- ── NOTIFICAÇÕES ─────────────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='user_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='is_read')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC) WHERE is_read = false';
    END IF;
  END IF;

  -- ── FOLLOWS ──────────────────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='follows') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='follows' AND column_name='follower_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='follows' AND column_name='followed_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_follows_followed ON public.follows (followed_id)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='follows' AND column_name='following_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id)';
    END IF;
  END IF;

  -- ── ASAAS WEBHOOK LOGS ───────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='oculto_asaas_webhook_logs') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='oculto_asaas_webhook_logs' AND column_name='received_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_asaas_webhook_received ON public.oculto_asaas_webhook_logs (received_at DESC)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='oculto_asaas_webhook_logs' AND column_name='processed')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='oculto_asaas_webhook_logs' AND column_name='received_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_asaas_webhook_processed ON public.oculto_asaas_webhook_logs (processed, received_at DESC)';
    END IF;
  END IF;

  -- ── TRANSACTIONS ─────────────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='transactions') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='user_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON public.transactions (user_id, created_at DESC)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='status')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions (status, created_at DESC)';
    END IF;
  END IF;

  -- ── PROFILE VISITS ───────────────────────────────────────────────
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profile_visits') THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profile_visits' AND column_name='visited_id')
       AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profile_visits' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profile_visits_visited_created ON public.profile_visits (visited_id, created_at DESC)';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profile_visits' AND column_name='visitor_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profile_visits_visitor ON public.profile_visits (visitor_id)';
    END IF;
  END IF;

END $$;

-- ANALYZE
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='posts') THEN
    EXECUTE 'ANALYZE public.posts';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') THEN
    EXECUTE 'ANALYZE public.profiles';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='messages') THEN
    EXECUTE 'ANALYZE public.messages';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
