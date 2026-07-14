-- =====================================================================
-- FASE 3 v2 — PERFORMANCE: índices compostos (defensivo, idempotente)
-- Projeto EXTERNO: rvybbrkzmboqbhcemqar
-- Cria cada índice somente se a tabela e todas as colunas existirem.
-- =====================================================================

DO $$
DECLARE
  r record;
  v_idx_defs text[] := ARRAY[
    'posts|author_id, created_at DESC|idx_posts_author_created',
    'posts|user_id, created_at DESC|idx_posts_user_created',
    'posts|created_at DESC|idx_posts_created_desc',
    'messages|conversation_id, created_at DESC|idx_messages_conv_created',
    'messages|sender_id, created_at DESC|idx_messages_sender_created',
    'messages|user_id, created_at DESC|idx_messages_user_created',
    'post_likes|post_id|idx_post_likes_post',
    'post_likes|user_id|idx_post_likes_user',
    'post_comments|post_id, created_at DESC|idx_post_comments_post_created',
    'follows|follower_id|idx_follows_follower',
    'follows|following_id|idx_follows_following',
    'notifications|user_id, created_at DESC|idx_notifications_user_created',
    'profile_visits|profile_id|idx_profile_visits_profile',
    'profile_likes|profile_id|idx_profile_likes_profile',
    'conversation_participants|user_id|idx_conv_participants_user',
    'conversation_participants|conversation_id|idx_conv_participants_conv',
    'transactions|user_id, created_at DESC|idx_transactions_user_created'
  ];
  v_def text; v_parts text[]; v_table text; v_cols text; v_idx text;
  v_missing boolean; v_count int := 0; v_skipped int := 0;
BEGIN
  FOREACH v_def IN ARRAY v_idx_defs LOOP
    v_parts := string_to_array(v_def, '|');
    v_table := v_parts[1]; v_cols := v_parts[2]; v_idx := v_parts[3];

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=v_table
    ) THEN
      RAISE NOTICE 'SKIP % — tabela ausente', v_idx;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_missing := false;
    FOR r IN
      SELECT trim(split_part(trim(c), ' ', 1)) AS col
      FROM unnest(string_to_array(v_cols, ',')) AS c
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=v_table AND column_name=r.col
      ) THEN
        RAISE NOTICE 'SKIP % — coluna ausente: %.%', v_idx, v_table, r.col;
        v_missing := true; EXIT;
      END IF;
    END LOOP;

    IF v_missing THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', v_idx, v_table, v_cols);
    v_count := v_count + 1;
    RAISE NOTICE 'OK   %', v_idx;
  END LOOP;

  RAISE NOTICE '=== Fase 3 v2: % criados, % pulados ===', v_count, v_skipped;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts','messages','post_likes','post_comments','follows',
                           'notifications','profile_visits','profile_likes',
                           'conversation_participants','transactions'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ANALYZE public.%I', t);
    END IF;
  END LOOP;
END $$;

SELECT schemaname||'.'||tablename AS tabela, indexname,
       pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_indexes
JOIN pg_class ON pg_class.relname = indexname
WHERE schemaname='public' AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
