-- Fase 3 v3 — Índices hot-path defensivos (sem PROCEDURE inline)
-- Idempotente. Verifica existência de tabela e colunas antes de criar cada índice.

DO $$
DECLARE
  defs text[] := ARRAY[
    'posts|author_id,created_at DESC|idx_posts_author_created',
    'posts|user_id,created_at DESC|idx_posts_user_created',
    'posts|created_at DESC|idx_posts_created',
    'messages|conversation_id,created_at DESC|idx_messages_conv_created',
    'messages|sender_id,created_at DESC|idx_messages_sender_created',
    'post_likes|post_id|idx_post_likes_post',
    'post_likes|user_id|idx_post_likes_user',
    'post_comments|post_id,created_at DESC|idx_post_comments_post_created',
    'post_comments|user_id|idx_post_comments_user',
    'follows|follower_id|idx_follows_follower',
    'follows|following_id|idx_follows_following',
    'notifications|user_id,created_at DESC|idx_notifications_user_created',
    'notifications|recipient_id,created_at DESC|idx_notifications_recipient_created',
    'profile_visits|profile_id|idx_profile_visits_profile',
    'profile_visits|visitor_id|idx_profile_visits_visitor',
    'profile_likes|profile_id|idx_profile_likes_profile',
    'profile_likes|liker_id|idx_profile_likes_liker',
    'conversation_participants|user_id|idx_conv_participants_user',
    'conversation_participants|conversation_id|idx_conv_participants_conv',
    'transactions|user_id,created_at DESC|idx_transactions_user_created',
    'stories|user_id,created_at DESC|idx_stories_user_created',
    'stories|author_id,created_at DESC|idx_stories_author_created'
  ];
  d text;
  v_table text;
  v_cols text;
  v_idx text;
  v_col_list text[];
  v_col_name text;
  v_missing text;
  v_part text;
BEGIN
  FOREACH d IN ARRAY defs LOOP
    v_table := split_part(d, '|', 1);
    v_cols  := split_part(d, '|', 2);
    v_idx   := split_part(d, '|', 3);

    -- tabela existe?
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=v_table
    ) THEN
      RAISE NOTICE 'SKIP % — tabela ausente: %', v_idx, v_table;
      CONTINUE;
    END IF;

    -- todas as colunas existem? (remove " DESC"/" ASC")
    v_col_list := string_to_array(v_cols, ',');
    v_missing := NULL;
    FOREACH v_part IN ARRAY v_col_list LOOP
      v_col_name := trim(split_part(trim(v_part), ' ', 1));
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=v_table AND column_name=v_col_name
      ) THEN
        v_missing := COALESCE(v_missing || ',', '') || v_col_name;
      END IF;
    END LOOP;

    IF v_missing IS NOT NULL THEN
      RAISE NOTICE 'SKIP % — coluna(s) ausente(s): %', v_idx, v_missing;
      CONTINUE;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', v_idx, v_table, v_cols);
    RAISE NOTICE 'OK   %', v_idx;
  END LOOP;
END $$;

-- ANALYZE nas tabelas existentes
DO $$
DECLARE
  t text;
  tabs text[] := ARRAY[
    'posts','messages','post_likes','post_comments','follows',
    'notifications','profile_visits','profile_likes',
    'conversation_participants','transactions','stories'
  ];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ANALYZE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Relatório
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname='public' AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
