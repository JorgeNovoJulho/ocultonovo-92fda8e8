-- =====================================================================
-- RELINK: vincula perfil antigo "BomBomSex" ao auth user andreiamaria4841@gmail.com
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Diagnóstico inicial (apenas leitura)
SELECT 'AUTH USER' AS tipo, id::text AS info1, email AS info2, email_confirmed_at::text AS info3
FROM auth.users
WHERE lower(email) = 'andreiamaria4841@gmail.com'
UNION ALL
SELECT 'PROFILE BOMBOMSEX', id::text, COALESCE(user_id::text,'(null)'), COALESCE(username,'(null)')
FROM public.profiles
WHERE lower(username) = lower('BomBomSex')
   OR lower(username) LIKE 'bombomsex%';

-- 2) Relink + correção de auth
DO $outer$
DECLARE
  v_email            text := 'andreiamaria4841@gmail.com';
  v_password         text := '123456';
  v_username         text := 'BomBomSex';
  v_auth_uid         uuid;
  v_prof_id          uuid;
  v_prof_old_user    uuid;
  v_dup_profile_id   uuid;
  v_ref              record;
BEGIN
  -- 2.1 Garantir auth.user válido (cria se não existir, conserta colunas internas)
  SELECT id INTO v_auth_uid
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_auth_uid IS NULL THEN
    v_auth_uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_sso_user, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_auth_uid, 'authenticated', 'authenticated',
      lower(v_email), crypt(v_password, gen_salt('bf')), now(),
      '', '', '', '', now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', 'Andreia Maria', 'username', v_username),
      false, false
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password     = crypt(v_password, gen_salt('bf')),
           email_confirmed_at     = COALESCE(email_confirmed_at, now()),
           confirmation_token     = COALESCE(confirmation_token, ''),
           recovery_token         = COALESCE(recovery_token, ''),
           email_change           = COALESCE(email_change, ''),
           email_change_token_new = COALESCE(email_change_token_new, ''),
           raw_user_meta_data     = COALESCE(raw_user_meta_data, '{}'::jsonb)
                                    || jsonb_build_object('name', 'Andreia Maria', 'username', v_username),
           raw_app_meta_data      = COALESCE(raw_app_meta_data, '{}'::jsonb)
                                    || '{"provider":"email","providers":["email"]}'::jsonb,
           banned_until           = NULL,
           deleted_at             = NULL,
           updated_at             = now()
     WHERE id = v_auth_uid;
  END IF;

  -- 2.2 Garantir identity (provider=email)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at
  )
  VALUES (
    gen_random_uuid(),
    v_auth_uid,
    jsonb_build_object('sub', v_auth_uid::text, 'email', lower(v_email)),
    'email',
    lower(v_email),
    now(), now(), now()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE
     SET user_id = EXCLUDED.user_id,
         identity_data = EXCLUDED.identity_data,
         last_sign_in_at = now(),
         updated_at = now();

  -- 2.3 Procurar perfil social antigo "BomBomSex" (este deve ser preservado)
  SELECT id, user_id
    INTO v_prof_id, v_prof_old_user
  FROM public.profiles
  WHERE lower(username) = lower(v_username)
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  -- 2.4 Procurar perfil duplicado criado para o auth atual
  SELECT id
    INTO v_dup_profile_id
  FROM public.profiles
  WHERE (id = v_auth_uid OR user_id = v_auth_uid)
    AND (v_prof_id IS NULL OR id <> v_prof_id)
  ORDER BY CASE WHEN id = v_auth_uid THEN 0 ELSE 1 END, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_prof_id IS NOT NULL THEN
    -- Se existir um perfil duplicado do auth atual, mescla vínculos dele no perfil social antigo
    IF v_dup_profile_id IS NOT NULL THEN
      FOR v_ref IN
        SELECT
          n.nspname AS schema_name,
          c.relname AS table_name,
          a.attname AS column_name
        FROM pg_constraint co
        JOIN pg_class c
          ON c.oid = co.conrelid
        JOIN pg_namespace n
          ON n.oid = c.relnamespace
        JOIN unnest(co.conkey) WITH ORDINALITY AS ck(attnum, ord)
          ON true
        JOIN unnest(co.confkey) WITH ORDINALITY AS fk(attnum, ord)
          ON fk.ord = ck.ord
        JOIN pg_attribute a
          ON a.attrelid = co.conrelid
         AND a.attnum = ck.attnum
        WHERE co.contype = 'f'
          AND co.confrelid = 'public.profiles'::regclass
          AND cardinality(co.conkey) = 1
          AND n.nspname = 'public'
          AND NOT (n.nspname = 'public' AND c.relname = 'profiles' AND a.attname = 'id')
      LOOP
        BEGIN
          EXECUTE format(
            'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
            v_ref.schema_name,
            v_ref.table_name,
            v_ref.column_name,
            v_ref.column_name
          ) USING v_prof_id, v_dup_profile_id;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Não foi possível reapontar %.%(%): %',
            v_ref.schema_name, v_ref.table_name, v_ref.column_name, SQLERRM;
        END;
      END LOOP;

      -- Mesclar referências comuns que podem usar user_id sem FK formal para profiles(id)
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='posts' AND column_name='author_id'
      ) THEN
        EXECUTE 'UPDATE public.posts SET author_id = $1 WHERE author_id = $2'
        USING v_prof_id, v_dup_profile_id;
      END IF;

      BEGIN
        DELETE FROM public.profiles WHERE id = v_dup_profile_id;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Perfil duplicado % não pôde ser removido: %', v_dup_profile_id, SQLERRM;
      END;
    END IF;

    -- IMPORTANTE: preserva o profiles.id antigo para não quebrar FKs históricas
    UPDATE public.profiles
       SET user_id    = v_auth_uid,
           username   = v_username,
           name       = COALESCE(NULLIF(name, ''), 'Andreia Maria'),
           updated_at = now()
     WHERE id = v_prof_id;

    RAISE NOTICE 'Perfil social preservado (profile_id=%) e vinculado ao auth_uid=%',
      v_prof_id, v_auth_uid;
  ELSIF v_dup_profile_id IS NOT NULL THEN
    -- Não achou perfil BomBomSex, mas já existe um perfil no auth atual: reutiliza este
    v_prof_id := v_dup_profile_id;

    UPDATE public.profiles
       SET user_id    = v_auth_uid,
           username   = v_username,
           name       = COALESCE(NULLIF(name, ''), 'Andreia Maria'),
           updated_at = now()
     WHERE id = v_prof_id;

    RAISE NOTICE 'Perfil do auth atual reaproveitado como BomBomSex (profile_id=%)', v_prof_id;
  ELSE
    -- Último fallback: criar perfil novo só se realmente não existir nenhum
    v_prof_id := v_auth_uid;

    INSERT INTO public.profiles (id, user_id, username, name, created_at, updated_at)
    VALUES (v_prof_id, v_auth_uid, v_username, 'Andreia Maria', now(), now())
    ON CONFLICT (id) DO UPDATE
       SET user_id    = EXCLUDED.user_id,
           username   = EXCLUDED.username,
           name       = EXCLUDED.name,
           updated_at = now();

    RAISE NOTICE 'Perfil BomBomSex não encontrado; novo perfil criado em fallback (profile_id=%)', v_prof_id;
  END IF;

  -- 2.5 Limpar flags de bloqueio no perfil final
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='account_status'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET account_status = ''active'' WHERE id = $1 OR user_id = $2'
    USING v_prof_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='banned_at'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET banned_at = NULL WHERE id = $1 OR user_id = $2'
    USING v_prof_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='ban_reason'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET ban_reason = NULL WHERE id = $1 OR user_id = $2'
    USING v_prof_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='is_shadowbanned'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET is_shadowbanned = false WHERE id = $1 OR user_id = $2'
    USING v_prof_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='frozen_until'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET frozen_until = NULL WHERE id = $1 OR user_id = $2'
    USING v_prof_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='fraud_frozen_until'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET fraud_frozen_until = NULL WHERE id = $1 OR user_id = $2'
    USING v_prof_id, v_auth_uid;
  END IF;

  -- 2.6 Reapontar colunas soltas que podem usar auth uid antigo/novo
  IF v_prof_old_user IS NOT NULL AND v_prof_old_user <> v_auth_uid THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='posts' AND column_name='user_id'
    ) THEN
      EXECUTE 'UPDATE public.posts SET user_id = $1 WHERE user_id = $2'
      USING v_auth_uid, v_prof_old_user;
    END IF;
  END IF;
END $outer$;

-- 3) Verificação final
SELECT
  u.id AS auth_uid,
  u.email,
  (u.email_confirmed_at IS NOT NULL) AS confirmado,
  p.id AS profile_id,
  p.user_id AS profile_user_id,
  p.username,
  p.name
FROM auth.users u
LEFT JOIN public.profiles p
  ON p.user_id = u.id
WHERE lower(u.email) = 'andreiamaria4841@gmail.com';
