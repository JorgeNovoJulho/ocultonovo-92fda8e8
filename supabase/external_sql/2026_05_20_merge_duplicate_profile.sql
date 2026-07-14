-- =========================================================================
-- 2026-05-20 — Consolidação de perfil duplicado
--
-- Verdadeiro:  cfba5772-dae6-435f-a691-e5a9e63b597c   (KEEP)
-- Duplicado:   0cbc6ae6-fe9f-42be-8acf-89fb2eeb7ede   (DROP)
--
-- O script faz:
--   1) Mostra um diagnóstico de onde cada UUID aparece (RAISE NOTICE).
--   2) Remapeia TODAS as colunas *_id (uuid) do schema `public` que referenciam
--      usuário, de DROP -> KEEP, ignorando erros de UNIQUE/PK (mantém o do KEEP).
--   3) Apaga o profile duplicado em public.profiles.
--   4) Apaga o usuário duplicado em auth.users (se existir).
--
-- Idempotente: rodar de novo após a primeira execução não causa estragos.
-- =========================================================================

DO $$
DECLARE
  v_keep uuid := 'cfba5772-dae6-435f-a691-e5a9e63b597c';
  v_drop uuid := '0cbc6ae6-fe9f-42be-8acf-89fb2eeb7ede';
  r record;
  v_sql text;
  v_count bigint;
  v_total_remapped bigint := 0;
  -- Colunas que costumamos usar para referenciar um usuário
  v_user_cols text[] := ARRAY[
    'user_id','author_id','owner_id','recipient_id','sender_id','creator_id',
    'from_user_id','to_user_id','actor_id','target_user_id','target_id',
    'liker_id','commenter_id','follower_id','following_id',
    'buyer_id','seller_id','blocker_id','blocked_id',
    'host_id','participant_id','inviter_id','invitee_id',
    'profile_id','member_id','reporter_id','reported_user_id'
  ];
BEGIN
  RAISE NOTICE '=== DIAGNÓSTICO — KEEP=% / DROP=% ===', v_keep, v_drop;

  -- 1) Profiles (mostra os dois lados)
  FOR r IN
    SELECT id, user_id, username, name, created_at
      FROM public.profiles
     WHERE user_id IN (v_keep, v_drop) OR id IN (v_keep, v_drop)
  LOOP
    RAISE NOTICE 'profiles: id=% user_id=% username=@% name=% created=%',
      r.id, r.user_id, r.username, r.name, r.created_at;
  END LOOP;

  -- 2) auth.users
  FOR r IN
    SELECT id, email, created_at, last_sign_in_at
      FROM auth.users
     WHERE id IN (v_keep, v_drop)
  LOOP
    RAISE NOTICE 'auth.users: id=% email=% created=% last_login=%',
      r.id, r.email, r.created_at, r.last_sign_in_at;
  END LOOP;

  -- 3) Para cada tabela do schema public, para cada coluna *_id uuid,
  --    contar quantas linhas apontam para DROP.
  RAISE NOTICE '--- Ocorrências do DROP (% ) por tabela.coluna ---', v_drop;
  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.data_type = 'uuid'
       AND c.column_name = ANY(v_user_cols)
       AND c.table_name NOT LIKE 'pg_%'
     ORDER BY c.table_name, c.column_name
  LOOP
    BEGIN
      v_sql := format('SELECT count(*) FROM public.%I WHERE %I = $1',
                      r.table_name, r.column_name);
      EXECUTE v_sql INTO v_count USING v_drop;
      IF v_count > 0 THEN
        RAISE NOTICE '   %.% = % linhas', r.table_name, r.column_name, v_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- coluna pode ser de view, ignora
      NULL;
    END;
  END LOOP;

  -- 4) Remapear DROP -> KEEP em todas as colunas detectadas.
  RAISE NOTICE '=== REMAPEAMENTO % -> % ===', v_drop, v_keep;
  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND t.table_type  = 'BASE TABLE'
       AND c.data_type   = 'uuid'
       AND c.column_name = ANY(v_user_cols)
       AND c.table_name NOT IN ('profiles')  -- profiles tratada à parte
     ORDER BY c.table_name, c.column_name
  LOOP
    BEGIN
      v_sql := format(
        'UPDATE public.%I SET %I = $1 WHERE %I = $2',
        r.table_name, r.column_name, r.column_name
      );
      EXECUTE v_sql USING v_keep, v_drop;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        v_total_remapped := v_total_remapped + v_count;
        RAISE NOTICE '   UPDATE %.% : % linhas', r.table_name, r.column_name, v_count;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        -- Conflito de chave única (ex.: já existe like/follow do KEEP no mesmo alvo).
        -- Apaga as linhas conflitantes do DROP (o KEEP já tem equivalente).
        BEGIN
          v_sql := format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name);
          EXECUTE v_sql USING v_drop;
          GET DIAGNOSTICS v_count = ROW_COUNT;
          RAISE NOTICE '   DELETE conflito %.% : % linhas', r.table_name, r.column_name, v_count;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE '   ! falha cleanup %.% : %', r.table_name, r.column_name, SQLERRM;
        END;
      WHEN foreign_key_violation THEN
        RAISE NOTICE '   ! FK bloqueou %.% (KEEP ausente em alguma tabela base): %',
          r.table_name, r.column_name, SQLERRM;
      WHEN OTHERS THEN
        RAISE NOTICE '   ! erro %.% : %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Total de linhas remapeadas: %', v_total_remapped;

  -- 5) Remover o profile duplicado (se ainda existir)
  DELETE FROM public.profiles
   WHERE user_id = v_drop OR id = v_drop;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'profiles deletados (DROP): %', v_count;

  -- 6) Remover o usuário duplicado em auth.users (se existir)
  BEGIN
    DELETE FROM auth.users WHERE id = v_drop;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'auth.users deletados (DROP): %', v_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '! Não foi possível remover auth.users (%): %', v_drop, SQLERRM;
  END;

  RAISE NOTICE '=== FIM ===';
END $$;

NOTIFY pgrst, 'reload schema';
