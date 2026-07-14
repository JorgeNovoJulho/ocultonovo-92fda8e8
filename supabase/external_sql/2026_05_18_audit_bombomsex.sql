-- =====================================================================
-- VARREDURA + CORREÇÃO COMPLETA — usuário BOMBOMSEX
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- Seguro contra ausência de tabelas/colunas como:
--   - public.follows
--   - referral_code / slug em profiles
--   - creator_id/user1_id/user2_id em tabelas legadas
-- =====================================================================

DROP TABLE IF EXISTS _audit_bombomsex_results;
CREATE TEMP TABLE _audit_bombomsex_results (
  ord integer,
  bloco text,
  payload jsonb
);

DO $$
DECLARE
  v_username constant text := 'BomBomSex';
  v_email    constant text := 'andreiamaria4841@gmail.com';

  v_auth_uid uuid;
  v_profile_id uuid;
  v_follow_table text;

  v_has_profiles boolean;
  v_has_posts boolean;
  v_has_subscription_plans boolean;
  v_has_conversations boolean;
  v_has_conversation_participants boolean;
  v_has_lookup_referral boolean;
  v_has_generate_referral boolean;

  v_profile_cols text[] := ARRAY[]::text[];
  v_post_cols text[] := ARRAY[]::text[];
  v_plan_cols text[] := ARRAY[]::text[];
  v_conv_cols text[] := ARRAY[]::text[];
  v_cp_cols text[] := ARRAY[]::text[];
  v_follow_cols text[] := ARRAY[]::text[];

  v_sets text[] := ARRAY[]::text[];
  v_insert_cols text[] := ARRAY[]::text[];
  v_insert_vals text[] := ARRAY[]::text[];
  v_filters text[] := ARRAY[]::text[];
  v_sql text;
  v_json jsonb;
  v_rowcount integer := 0;

  v_posts_total integer := 0;
  v_posts_sem_author integer := 0;
  v_followers integer := 0;
  v_following integer := 0;
  v_referred integer := 0;
  v_conversations integer := 0;
  v_plans integer := 0;
  v_referral_lookup jsonb := NULL;
  v_referral_text text := NULL;
BEGIN
  v_has_profiles := to_regclass('public.profiles') IS NOT NULL;
  v_has_posts := to_regclass('public.posts') IS NOT NULL;
  v_has_subscription_plans := to_regclass('public.subscription_plans') IS NOT NULL;
  v_has_conversations := to_regclass('public.conversations') IS NOT NULL;
  v_has_conversation_participants := to_regclass('public.conversation_participants') IS NOT NULL;

  IF to_regclass('public.follows') IS NOT NULL THEN
    v_follow_table := 'public.follows';
  ELSIF to_regclass('public.followers') IS NOT NULL THEN
    v_follow_table := 'public.followers';
  ELSE
    v_follow_table := NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'lookup_referral_code'
  ) INTO v_has_lookup_referral;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'generate_creator_referral_code'
  ) INTO v_has_generate_referral;

  IF NOT v_has_profiles THEN
    INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
    VALUES (
      1,
      'ERRO',
      jsonb_build_object('erro', 'Tabela public.profiles não existe no banco externo.')
    );
    RETURN;
  END IF;

  SELECT array_agg(column_name ORDER BY ordinal_position)
    INTO v_profile_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles';

  IF v_has_posts THEN
    SELECT array_agg(column_name ORDER BY ordinal_position)
      INTO v_post_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts';
  END IF;

  IF v_has_subscription_plans THEN
    SELECT array_agg(column_name ORDER BY ordinal_position)
      INTO v_plan_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription_plans';
  END IF;

  IF v_has_conversations THEN
    SELECT array_agg(column_name ORDER BY ordinal_position)
      INTO v_conv_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations';
  END IF;

  IF v_has_conversation_participants THEN
    SELECT array_agg(column_name ORDER BY ordinal_position)
      INTO v_cp_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversation_participants';
  END IF;

  IF v_follow_table IS NOT NULL THEN
    SELECT array_agg(column_name ORDER BY ordinal_position)
      INTO v_follow_cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = split_part(v_follow_table, '.', 2);
  END IF;

  INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
  VALUES (
    2,
    'SCHEMA_CHECK',
    jsonb_build_object(
      'follow_table_detectada', v_follow_table,
      'has_lookup_referral_code', v_has_lookup_referral,
      'has_generate_creator_referral_code', v_has_generate_referral,
      'profiles_cols', COALESCE(to_jsonb(v_profile_cols), '[]'::jsonb),
      'posts_cols', COALESCE(to_jsonb(v_post_cols), '[]'::jsonb),
      'subscription_plans_cols', COALESCE(to_jsonb(v_plan_cols), '[]'::jsonb),
      'conversations_cols', COALESCE(to_jsonb(v_conv_cols), '[]'::jsonb),
      'conversation_participants_cols', COALESCE(to_jsonb(v_cp_cols), '[]'::jsonb),
      'follow_cols', COALESCE(to_jsonb(v_follow_cols), '[]'::jsonb)
    )
  );

  SELECT id
    INTO v_auth_uid
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF array_position(v_profile_cols, 'user_id') IS NOT NULL AND v_auth_uid IS NOT NULL THEN
    EXECUTE format(
      'SELECT id FROM public.profiles WHERE user_id = %L::uuid LIMIT 1',
      v_auth_uid::text
    ) INTO v_profile_id;
  END IF;

  IF v_profile_id IS NULL AND array_position(v_profile_cols, 'username') IS NOT NULL THEN
    EXECUTE format(
      'SELECT id FROM public.profiles WHERE lower(username) = lower(%L) LIMIT 1',
      v_username
    ) INTO v_profile_id;
  END IF;

  IF v_profile_id IS NULL AND array_position(v_profile_cols, 'name') IS NOT NULL THEN
    EXECUTE format(
      'SELECT id FROM public.profiles WHERE lower(name) = lower(%L) LIMIT 1',
      v_username
    ) INTO v_profile_id;
  END IF;

  INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
  VALUES (
    3,
    'IDS_RESOLVIDOS',
    jsonb_build_object(
      'auth_uid', v_auth_uid,
      'profile_id_inicial', v_profile_id,
      'email', v_email,
      'username', v_username
    )
  );

  IF v_auth_uid IS NOT NULL THEN
    BEGIN
      UPDATE auth.users
      SET email_confirmed_at = COALESCE(email_confirmed_at, now())
      WHERE id = v_auth_uid;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
      VALUES (4, 'WARN_AUTH', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;

  IF v_profile_id IS NULL AND v_auth_uid IS NOT NULL THEN
    IF array_position(v_profile_cols, 'id') IS NOT NULL THEN
      v_insert_cols := array_append(v_insert_cols, 'id');
      v_insert_vals := array_append(v_insert_vals, 'gen_random_uuid()');
    END IF;
    IF array_position(v_profile_cols, 'user_id') IS NOT NULL THEN
      v_insert_cols := array_append(v_insert_cols, 'user_id');
      v_insert_vals := array_append(v_insert_vals, format('%L::uuid', v_auth_uid::text));
    END IF;
    IF array_position(v_profile_cols, 'username') IS NOT NULL THEN
      v_insert_cols := array_append(v_insert_cols, 'username');
      v_insert_vals := array_append(v_insert_vals, format('%L', v_username));
    END IF;
    IF array_position(v_profile_cols, 'name') IS NOT NULL THEN
      v_insert_cols := array_append(v_insert_cols, 'name');
      v_insert_vals := array_append(v_insert_vals, format('%L', v_username));
    END IF;
    IF array_position(v_profile_cols, 'is_creator') IS NOT NULL THEN
      v_insert_cols := array_append(v_insert_cols, 'is_creator');
      v_insert_vals := array_append(v_insert_vals, 'true');
    END IF;
    IF array_position(v_profile_cols, 'created_at') IS NOT NULL THEN
      v_insert_cols := array_append(v_insert_cols, 'created_at');
      v_insert_vals := array_append(v_insert_vals, 'now()');
    END IF;
    IF array_position(v_profile_cols, 'updated_at') IS NOT NULL THEN
      v_insert_cols := array_append(v_insert_cols, 'updated_at');
      v_insert_vals := array_append(v_insert_vals, 'now()');
    END IF;

    IF coalesce(array_length(v_insert_cols, 1), 0) > 0 THEN
      v_sql := format(
        'INSERT INTO public.profiles (%s) VALUES (%s) RETURNING id',
        array_to_string(v_insert_cols, ', '),
        array_to_string(v_insert_vals, ', ')
      );
      BEGIN
        EXECUTE v_sql INTO v_profile_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
        VALUES (5, 'WARN_CREATE_PROFILE', jsonb_build_object('erro', SQLERRM, 'sql', v_sql));
      END;
    END IF;
  END IF;

  IF v_profile_id IS NOT NULL THEN
    v_sets := ARRAY[]::text[];

    IF array_position(v_profile_cols, 'user_id') IS NOT NULL AND v_auth_uid IS NOT NULL THEN
      v_sets := array_append(v_sets, format('user_id = %L::uuid', v_auth_uid::text));
    END IF;
    IF array_position(v_profile_cols, 'username') IS NOT NULL THEN
      v_sets := array_append(v_sets, format('username = COALESCE(NULLIF(username, ''''), %L)', v_username));
    END IF;
    IF array_position(v_profile_cols, 'name') IS NOT NULL THEN
      v_sets := array_append(v_sets, format('name = COALESCE(NULLIF(name, ''''), %L)', v_username));
    END IF;
    IF array_position(v_profile_cols, 'is_creator') IS NOT NULL THEN
      v_sets := array_append(v_sets, 'is_creator = COALESCE(is_creator, true)');
    END IF;
    IF array_position(v_profile_cols, 'updated_at') IS NOT NULL THEN
      v_sets := array_append(v_sets, 'updated_at = now()');
    END IF;

    IF coalesce(array_length(v_sets, 1), 0) > 0 THEN
      v_sql := format(
        'UPDATE public.profiles SET %s WHERE id = %L::uuid',
        array_to_string(v_sets, ', '),
        v_profile_id::text
      );
      BEGIN
        EXECUTE v_sql;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
        VALUES (6, 'WARN_UPDATE_PROFILE', jsonb_build_object('erro', SQLERRM, 'sql', v_sql));
      END;
    END IF;

    IF array_position(v_profile_cols, 'creator_referral_code') IS NOT NULL THEN
      BEGIN
        IF v_has_generate_referral THEN
          EXECUTE format(
            'SELECT CASE WHEN COALESCE(creator_referral_code, '''') = '''' THEN public.generate_creator_referral_code(%L::uuid) ELSE creator_referral_code END FROM public.profiles WHERE id = %L::uuid',
            v_profile_id::text,
            v_profile_id::text
          ) INTO v_referral_text;
        ELSE
          EXECUTE format(
            'UPDATE public.profiles SET creator_referral_code = COALESCE(NULLIF(creator_referral_code, ''''), UPPER(REGEXP_REPLACE(%L, ''[^a-zA-Z0-9]'', '''', ''g'')) || RIGHT(REPLACE(%L::text, ''-'', ''''), 6)) WHERE id = %L::uuid',
            v_username,
            v_profile_id::text,
            v_profile_id::text
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
        VALUES (7, 'WARN_REFERRAL', jsonb_build_object('erro', SQLERRM));
      END;
    END IF;
  END IF;

  IF v_profile_id IS NOT NULL AND v_has_posts THEN
    v_filters := ARRAY[]::text[];

    IF array_position(v_post_cols, 'author_id') IS NOT NULL THEN
      v_filters := array_append(v_filters, format('author_id = %L::uuid', v_profile_id::text));
    END IF;
    IF array_position(v_post_cols, 'creator_id') IS NOT NULL THEN
      v_filters := array_append(v_filters, format('creator_id = %L::uuid', v_profile_id::text));
      IF v_auth_uid IS NOT NULL THEN
        v_filters := array_append(v_filters, format('creator_id = %L::uuid', v_auth_uid::text));
      END IF;
    END IF;
    IF array_position(v_post_cols, 'user_id') IS NOT NULL THEN
      v_filters := array_append(v_filters, format('user_id = %L::uuid', v_profile_id::text));
      IF v_auth_uid IS NOT NULL THEN
        v_filters := array_append(v_filters, format('user_id = %L::uuid', v_auth_uid::text));
      END IF;
    END IF;

    IF array_position(v_post_cols, 'author_id') IS NOT NULL AND coalesce(array_length(v_filters, 1), 0) > 0 THEN
      v_sql := format(
        'UPDATE public.posts p SET author_id = %L::uuid WHERE (%s) AND (p.author_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p.author_id))',
        v_profile_id::text,
        array_to_string(v_filters, ' OR ')
      );
      BEGIN
        EXECUTE v_sql;
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
        VALUES (8, 'REPARO_POSTS_AUTHOR', jsonb_build_object('linhas_corrigidas', v_rowcount));
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
        VALUES (8, 'WARN_POSTS_AUTHOR', jsonb_build_object('erro', SQLERRM, 'sql', v_sql));
      END;
    END IF;

    IF coalesce(array_length(v_filters, 1), 0) > 0 THEN
      v_sql := format('SELECT COUNT(*) FROM public.posts WHERE %s', array_to_string(v_filters, ' OR '));
      EXECUTE v_sql INTO v_posts_total;
    END IF;

    IF array_position(v_post_cols, 'author_id') IS NOT NULL AND coalesce(array_length(v_filters, 1), 0) > 0 THEN
      v_sql := format(
        'SELECT COUNT(*) FROM public.posts p WHERE (%s) AND (p.author_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p.author_id))',
        array_to_string(v_filters, ' OR ')
      );
      EXECUTE v_sql INTO v_posts_sem_author;
    END IF;
  END IF;

  IF v_profile_id IS NOT NULL AND v_follow_table IS NOT NULL
     AND array_position(v_follow_cols, 'following_id') IS NOT NULL
     AND array_position(v_follow_cols, 'follower_id') IS NOT NULL THEN
    BEGIN
      EXECUTE format('SELECT COUNT(*) FROM %s WHERE following_id = %L::uuid', v_follow_table, v_profile_id::text)
        INTO v_followers;
      EXECUTE format('SELECT COUNT(*) FROM %s WHERE follower_id = %L::uuid', v_follow_table, v_profile_id::text)
        INTO v_following;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
      VALUES (9, 'WARN_FOLLOWS', jsonb_build_object('erro', SQLERRM, 'tabela', v_follow_table));
    END;
  END IF;

  IF v_profile_id IS NOT NULL AND array_position(v_profile_cols, 'referred_by_creator_id') IS NOT NULL THEN
    EXECUTE format(
      'SELECT COUNT(*) FROM public.profiles WHERE referred_by_creator_id = %L::uuid',
      v_profile_id::text
    ) INTO v_referred;
  END IF;

  IF v_has_lookup_referral THEN
    BEGIN
      EXECUTE format('SELECT to_jsonb(public.lookup_referral_code(%L))', v_username)
        INTO v_referral_lookup;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
      VALUES (10, 'WARN_LOOKUP_REFERRAL', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;

  IF v_profile_id IS NOT NULL AND v_has_subscription_plans THEN
    BEGIN
      IF array_position(v_plan_cols, 'creator_id') IS NOT NULL THEN
        EXECUTE format('SELECT COUNT(*) FROM public.subscription_plans WHERE creator_id = %L::uuid', v_profile_id::text)
          INTO v_plans;
      ELSIF array_position(v_plan_cols, 'profile_id') IS NOT NULL THEN
        EXECUTE format('SELECT COUNT(*) FROM public.subscription_plans WHERE profile_id = %L::uuid', v_profile_id::text)
          INTO v_plans;
      ELSE
        v_plans := 0;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
      VALUES (11, 'WARN_PLANS', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;

  IF v_has_conversation_participants AND v_profile_id IS NOT NULL THEN
    BEGIN
      IF array_position(v_cp_cols, 'profile_id') IS NOT NULL THEN
        EXECUTE format('SELECT COUNT(DISTINCT conversation_id) FROM public.conversation_participants WHERE profile_id = %L::uuid', v_profile_id::text)
          INTO v_conversations;
      ELSIF array_position(v_cp_cols, 'user_id') IS NOT NULL AND v_auth_uid IS NOT NULL THEN
        EXECUTE format('SELECT COUNT(DISTINCT conversation_id) FROM public.conversation_participants WHERE user_id = %L::uuid', v_auth_uid::text)
          INTO v_conversations;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
      VALUES (12, 'WARN_CONVERSATION_PARTICIPANTS', jsonb_build_object('erro', SQLERRM));
    END;
  ELSIF v_has_conversations THEN
    BEGIN
      IF array_position(v_conv_cols, 'user1_id') IS NOT NULL AND array_position(v_conv_cols, 'user2_id') IS NOT NULL THEN
        IF v_auth_uid IS NOT NULL THEN
          EXECUTE format(
            'SELECT COUNT(*) FROM public.conversations WHERE user1_id = %L::uuid OR user2_id = %L::uuid',
            v_auth_uid::text,
            v_auth_uid::text
          ) INTO v_conversations;
        ELSIF v_profile_id IS NOT NULL THEN
          EXECUTE format(
            'SELECT COUNT(*) FROM public.conversations WHERE user1_id = %L::uuid OR user2_id = %L::uuid',
            v_profile_id::text,
            v_profile_id::text
          ) INTO v_conversations;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
      VALUES (13, 'WARN_CONVERSAS', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;

  IF v_profile_id IS NOT NULL THEN
    EXECUTE format('SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = %L::uuid', v_profile_id::text)
      INTO v_json;
  ELSE
    v_json := NULL;
  END IF;

  INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
  VALUES (
    20,
    'PROFILE_FINAL',
    COALESCE(v_json, jsonb_build_object('erro', 'Perfil não localizado/criado'))
  );

  INSERT INTO _audit_bombomsex_results(ord, bloco, payload)
  VALUES (
    21,
    'RESUMO_FINAL',
    jsonb_build_object(
      'auth_uid', v_auth_uid,
      'profile_id', v_profile_id,
      'follow_table', v_follow_table,
      'posts_total_relacionados', v_posts_total,
      'posts_sem_author_apos_correcao', v_posts_sem_author,
      'seguidores', v_followers,
      'seguindo', v_following,
      'referidos', v_referred,
      'planos_relacionados', v_plans,
      'conversas_relacionadas', v_conversations,
      'lookup_referral_code', v_referral_lookup
    )
  );
END $$;

SELECT bloco, payload
FROM _audit_bombomsex_results
ORDER BY ord, bloco;
