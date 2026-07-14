-- =============================================================================
-- LOGIN REPAIR TOOLKIT (GENÉRICO / IDEMPOTENTE)
-- Projeto externo: rvybbrkzmboqbhcemqar
--
-- O que este script corrige:
-- 1) Garante auth.users válido para o e-mail informado
-- 2) Garante auth.identities(provider=email) apontando para o mesmo auth user
-- 3) Relinka / cria public.profiles corretamente para o auth user
-- 4) Limpa flags comuns de bloqueio no profile final (se existirem)
-- 5) Reaponta FKs simples para preservar o profile social antigo, quando aplicável
--
-- IMPORTANTE:
-- - Este script corrige inconsistência CADASTRAL de login.
-- - Ele NÃO corrige indisponibilidade do provedor (timeouts 504/522 em auth/rest).
-- - Edite SOMENTE o bloco CONFIG antes de executar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- DIAGNÓSTICO INICIAL
-- Edite os valores abaixo ANTES de rodar.
-- -----------------------------------------------------------------------------
WITH cfg AS (
  SELECT
    lower('EMAIL_AQUI@example.com')::text AS email,
    nullif('USERNAME_AQUI', '')::text     AS username
)
SELECT 'auth.users' AS origem, u.id::text AS id_1, u.email AS ref_1,
       u.email_confirmed_at::text AS ref_2,
       CASE WHEN u.deleted_at IS NULL THEN 'not_deleted' ELSE 'deleted' END AS ref_3
FROM auth.users u
JOIN cfg c ON lower(u.email) = c.email

UNION ALL

SELECT 'auth.identities', i.user_id::text, i.provider,
       i.provider_id,
       coalesce(i.last_sign_in_at::text, '(never)')
FROM auth.identities i
JOIN cfg c ON i.provider = 'email' AND lower(i.provider_id) = c.email

UNION ALL

SELECT 'public.profiles', p.id::text,
       coalesce(p.user_id::text, '(null)'),
       coalesce(p.username, '(null)'),
       coalesce(p.name, '(null)')
FROM public.profiles p
JOIN cfg c ON (
  p.user_id::text = c.email -- nunca vai bater; apenas mantém shape consistente
  OR (c.username IS NOT NULL AND lower(coalesce(p.username, '')) = lower(c.username))
)
ORDER BY origem;

-- -----------------------------------------------------------------------------
-- REPARO PRINCIPAL
-- -----------------------------------------------------------------------------
DO $outer$
DECLARE
  -- ========================= CONFIG =========================
  v_email            text := lower('EMAIL_AQUI@example.com');
  v_password         text := nullif('NOVA_SENHA_AQUI', '');
  v_username         text := nullif('USERNAME_AQUI', '');
  v_name             text := nullif('NOME_AQUI', '');
  v_target_profile   uuid := null; -- opcional: profile_id exato a preservar
  -- ==========================================================

  v_auth_uid         uuid;
  v_profile_id       uuid;
  v_profile_old_user uuid;
  v_dup_profile_id   uuid;
  v_ref              record;
BEGIN
  IF v_email IS NULL OR v_email = '' OR v_email LIKE '%AQUI%' THEN
    RAISE EXCEPTION 'Edite o bloco CONFIG e informe um e-mail real antes de executar.';
  END IF;

  -- 1) Garantir auth.users consistente
  SELECT id INTO v_auth_uid
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_auth_uid IS NULL THEN
    v_auth_uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_sso_user,
      is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_auth_uid,
      'authenticated',
      'authenticated',
      v_email,
      CASE
        WHEN v_password IS NOT NULL THEN crypt(v_password, gen_salt('bf'))
        ELSE crypt(gen_random_uuid()::text, gen_salt('bf'))
      END,
      now(),
      '',
      '',
      '',
      '',
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_strip_nulls(jsonb_build_object('name', v_name, 'username', v_username)),
      false,
      false
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = CASE
             WHEN v_password IS NOT NULL THEN crypt(v_password, gen_salt('bf'))
             ELSE encrypted_password
           END,
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           confirmation_token = COALESCE(confirmation_token, ''),
           recovery_token = COALESCE(recovery_token, ''),
           email_change = COALESCE(email_change, ''),
           email_change_token_new = COALESCE(email_change_token_new, ''),
           banned_until = NULL,
           deleted_at = NULL,
           updated_at = now(),
           raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
             || '{"provider":"email","providers":["email"]}'::jsonb,
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object('name', v_name, 'username', v_username))
     WHERE id = v_auth_uid;
  END IF;

  -- 2) Garantir auth.identities alinhado
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at,
    last_sign_in_at
  ) VALUES (
    gen_random_uuid(),
    v_auth_uid,
    jsonb_build_object('sub', v_auth_uid::text, 'email', v_email),
    'email',
    v_email,
    now(),
    now(),
    now()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE
     SET user_id = EXCLUDED.user_id,
         identity_data = EXCLUDED.identity_data,
         updated_at = now(),
         last_sign_in_at = now();

  -- 3) Descobrir profile principal a preservar
  IF v_target_profile IS NOT NULL THEN
    SELECT id, user_id INTO v_profile_id, v_profile_old_user
    FROM public.profiles
    WHERE id = v_target_profile
    LIMIT 1;
  END IF;

  IF v_profile_id IS NULL AND v_username IS NOT NULL THEN
    SELECT id, user_id INTO v_profile_id, v_profile_old_user
    FROM public.profiles
    WHERE lower(coalesce(username, '')) = lower(v_username)
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_profile_id IS NULL THEN
    SELECT id, user_id INTO v_profile_id, v_profile_old_user
    FROM public.profiles
    WHERE user_id = v_auth_uid OR id = v_auth_uid
    ORDER BY CASE WHEN id = v_auth_uid THEN 0 ELSE 1 END, created_at ASC NULLS LAST
    LIMIT 1;
  END IF;

  -- 4) Localizar profile duplicado gerado para esse auth user (se houver)
  SELECT id INTO v_dup_profile_id
  FROM public.profiles
  WHERE (id = v_auth_uid OR user_id = v_auth_uid)
    AND (v_profile_id IS NULL OR id <> v_profile_id)
  ORDER BY CASE WHEN id = v_auth_uid THEN 0 ELSE 1 END, created_at DESC NULLS LAST
  LIMIT 1;

  -- 5) Se existe profile principal + duplicado, reapontar FKs simples
  IF v_profile_id IS NOT NULL AND v_dup_profile_id IS NOT NULL THEN
    FOR v_ref IN
      SELECT
        n.nspname AS schema_name,
        c.relname AS table_name,
        a.attname AS column_name
      FROM pg_constraint co
      JOIN pg_class c ON c.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN unnest(co.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
      JOIN unnest(co.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
      JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = ck.attnum
      WHERE co.contype = 'f'
        AND co.confrelid = 'public.profiles'::regclass
        AND cardinality(co.conkey) = 1
        AND n.nspname = 'public'
        AND NOT (n.nspname = 'public' AND c.relname = 'profiles' AND a.attname = 'id')
    LOOP
      BEGIN
        EXECUTE format(
          'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
          v_ref.schema_name, v_ref.table_name, v_ref.column_name, v_ref.column_name
        ) USING v_profile_id, v_dup_profile_id;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Falha ao reapontar %.%(%): %',
          v_ref.schema_name, v_ref.table_name, v_ref.column_name, SQLERRM;
      END;
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='posts' AND column_name='author_id'
    ) THEN
      EXECUTE 'UPDATE public.posts SET author_id = $1 WHERE author_id = $2'
      USING v_profile_id, v_dup_profile_id;
    END IF;

    BEGIN
      DELETE FROM public.profiles WHERE id = v_dup_profile_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Não foi possível remover profile duplicado %: %', v_dup_profile_id, SQLERRM;
    END;
  END IF;

  -- 6) Reutilizar ou criar profile final
  IF v_profile_id IS NOT NULL THEN
    UPDATE public.profiles
       SET user_id = v_auth_uid,
           username = COALESCE(v_username, username),
           name = COALESCE(v_name, NULLIF(name, ''), name),
           updated_at = now()
     WHERE id = v_profile_id;
  ELSE
    v_profile_id := v_auth_uid;

    INSERT INTO public.profiles (
      id,
      user_id,
      username,
      name,
      created_at,
      updated_at
    ) VALUES (
      v_profile_id,
      v_auth_uid,
      v_username,
      COALESCE(v_name, split_part(v_email, '@', 1)),
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           username = COALESCE(EXCLUDED.username, public.profiles.username),
           name = COALESCE(EXCLUDED.name, public.profiles.name),
           updated_at = now();
  END IF;

  -- 7) Limpeza de flags comuns que podem bloquear acesso
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='account_status'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET account_status = ''active'' WHERE id = $1 OR user_id = $2'
    USING v_profile_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='banned_at'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET banned_at = NULL WHERE id = $1 OR user_id = $2'
    USING v_profile_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='ban_reason'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET ban_reason = NULL WHERE id = $1 OR user_id = $2'
    USING v_profile_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='is_shadowbanned'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET is_shadowbanned = false WHERE id = $1 OR user_id = $2'
    USING v_profile_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='frozen_until'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET frozen_until = NULL WHERE id = $1 OR user_id = $2'
    USING v_profile_id, v_auth_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='fraud_frozen_until'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET fraud_frozen_until = NULL WHERE id = $1 OR user_id = $2'
    USING v_profile_id, v_auth_uid;
  END IF;

  -- 8) Compat: se o profile antigo tinha outro user_id histórico, reaponta colunas soltas comuns
  IF v_profile_old_user IS NOT NULL AND v_profile_old_user <> v_auth_uid THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='posts' AND column_name='user_id'
    ) THEN
      EXECUTE 'UPDATE public.posts SET user_id = $1 WHERE user_id = $2'
      USING v_auth_uid, v_profile_old_user;
    END IF;
  END IF;

  RAISE NOTICE 'Login repair concluído. auth_uid=%, profile_id=%', v_auth_uid, v_profile_id;
END
$outer$;

-- -----------------------------------------------------------------------------
-- VERIFICAÇÃO FINAL
-- -----------------------------------------------------------------------------
WITH cfg AS (
  SELECT lower('EMAIL_AQUI@example.com')::text AS email
)
SELECT
  u.id AS auth_uid,
  u.email,
  (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
  (u.deleted_at IS NULL) AS not_deleted,
  (u.banned_until IS NULL) AS not_banned,
  i.provider,
  i.provider_id,
  p.id AS profile_id,
  p.user_id AS profile_user_id,
  p.username,
  p.name
FROM cfg c
LEFT JOIN auth.users u
  ON lower(u.email) = c.email
LEFT JOIN auth.identities i
  ON i.user_id = u.id AND i.provider = 'email'
LEFT JOIN public.profiles p
  ON p.user_id = u.id OR p.id = u.id
ORDER BY p.created_at NULLS LAST, p.updated_at NULLS LAST;
