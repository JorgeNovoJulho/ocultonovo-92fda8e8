-- =====================================================================
-- FASE 3 — PERFORMANCE: índices compostos hot-path
-- Projeto EXTERNO: rvybbrkzmboqbhcemqar
-- IDEMPOTENTE — todos os índices usam IF NOT EXISTS.
-- Não usa CONCURRENTLY (incompatível com bloco transacional do editor).
-- =====================================================================

-- POSTS
CREATE INDEX IF NOT EXISTS idx_posts_author_created  ON public.posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_created    ON public.posts (user_id,   created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_desc    ON public.posts (created_at DESC);

-- MESSAGES
CREATE INDEX IF NOT EXISTS idx_messages_conv_created   ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages (sender_id,       created_at DESC);

-- POST_LIKES
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON public.post_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON public.post_likes (user_id);

-- POST_COMMENTS
CREATE INDEX IF NOT EXISTS idx_post_comments_post_created ON public.post_comments (post_id, created_at DESC);

-- FOLLOWS
CREATE INDEX IF NOT EXISTS idx_follows_follower  ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

-- NOTIFICATIONS
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);

-- PROFILE_VISITS / PROFILE_LIKES
CREATE INDEX IF NOT EXISTS idx_profile_visits_profile ON public.profile_visits (profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_likes_profile  ON public.profile_likes  (profile_id);

-- CONVERSATION_PARTICIPANTS
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON public.conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON public.conversation_participants (conversation_id);

-- TRANSACTIONS
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON public.transactions (user_id, created_at DESC);

-- ANALYZE
ANALYZE public.posts;
ANALYZE public.messages;
ANALYZE public.post_likes;
ANALYZE public.post_comments;
ANALYZE public.follows;
ANALYZE public.notifications;
ANALYZE public.profile_visits;
ANALYZE public.profile_likes;
ANALYZE public.conversation_participants;
ANALYZE public.transactions;

-- Relatório
SELECT schemaname || '.' || tablename AS tabela, indexname,
       pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_indexes
JOIN pg_class ON pg_class.relname = indexname
WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
