-- =====================================================================
-- VERIFICAÇÃO E CORREÇÃO FINAL: bombomsex
-- ID canônico: 0cbc6ae6-fe9f-42be-8acf-89fb2eeb7ede
-- ID conflitante (deve estar removido): cfba5772-dae6-435f-a691-e5a9e63b597c
-- Rode no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Idempotente.
-- =====================================================================

DO $$
DECLARE
  v_keep uuid := '0cbc6ae6-fe9f-42be-8acf-89fb2eeb7ede';
  v_drop uuid := 'cfba5772-dae6-435f-a691-e5a9e63b597c';
  r record;
  v_sql text;
  v_count bigint;
BEGIN
  RAISE NOTICE '=== 1. Estado atual em profiles ===';
  FOR r IN
    SELECT id, user_id, username FROM public.profiles
    WHERE id IN (v_keep, v_drop) OR user_id IN (v_keep, v_drop) OR username = 'bombomsex'
  LOOP
    RAISE NOTICE 'profile id=% user_id=% username=%', r.id, r.user_id, r.username;
  END LOOP;

  RAISE NOTICE '=== 2. Estado atual em auth.users ===';
  FOR r IN
    SELECT id, email FROM auth.users WHERE id IN (v_keep, v_drop)
  LOOP
    RAISE NOTICE 'auth.users id=% email=%', r.id, r.email;
  END LOOP;

  RAISE NOTICE '=== 3. Remapeando qualquer resíduo de % -> % ===', v_drop, v_keep;
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.data_type = 'uuid'
      AND (c.column_name LIKE '%user_id%'
           OR c.column_name IN ('author_id','liker_id','follower_id','following_id',
                                'profile_id','sender_id','recipient_id','owner_id',
                                'creator_id','from_user_id','to_user_id','buyer_id',
                                'seller_id','reporter_id','reported_user_id','reviewer_id',
                                'host_id','guest_id','reviewed_user_id'))
  LOOP
    BEGIN
      v_sql := format('UPDATE %I.%I SET %I = $1 WHERE %I = $2',
                      r.table_schema, r.table_name, r.column_name, r.column_name);
      EXECUTE v_sql USING v_keep, v_drop;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        RAISE NOTICE '  remap %.% (%): % linha(s)', r.table_schema, r.table_name, r.column_name, v_count;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      v_sql := format('DELETE FROM %I.%I WHERE %I = $1',
                      r.table_schema, r.table_name, r.column_name);
      EXECUTE v_sql USING v_drop;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      RAISE NOTICE '  conflito unique em %.% (%) -> deletadas % linha(s)', r.table_schema, r.table_name, r.column_name, v_count;
    WHEN OTHERS THEN
      RAISE NOTICE '  pulando %.% (%): %', r.table_schema, r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '=== 4. Remoção do profile/auth duplicado, se ainda existir ===';
  DELETE FROM public.profiles WHERE id = v_drop;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  profiles deletadas: %', v_count;

  BEGIN
    DELETE FROM auth.users WHERE id = v_drop;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  auth.users deletadas: %', v_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '  auth.users delete falhou: %', SQLERRM;
  END;

  RAISE NOTICE '=== 5. Garantir profiles.user_id = id para bombomsex ===';
  UPDATE public.profiles
     SET user_id = v_keep
   WHERE id = v_keep AND (user_id IS NULL OR user_id <> v_keep);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  user_id corrigido em % linha(s)', v_count;

  RAISE NOTICE '=== 6. Contagem final de posts apontando para bombomsex ===';
  SELECT count(*) INTO v_count FROM public.posts
   WHERE author_id = v_keep OR user_id = v_keep;
  RAISE NOTICE '  posts ligados ao ID canônico: %', v_count;

  SELECT count(*) INTO v_count FROM public.posts
   WHERE author_id = v_drop OR user_id = v_drop;
  RAISE NOTICE '  posts ainda ligados ao ID conflitante (deve ser 0): %', v_count;
END $$;

NOTIFY pgrst, 'reload schema';
