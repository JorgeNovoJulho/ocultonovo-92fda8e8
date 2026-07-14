-- ============================================================================
-- HOTFIX LOGIN — andreiamaria4841@gmail.com
-- Dollar-quotes nomeados ($outer$ / $sql$) para evitar conflito de $$ aninhado.
-- ============================================================================

DO $outer$
DECLARE
  v_email text := 'andreiamaria4841@gmail.com';
  v_password text := '123456';
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_sso_user, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', lower(v_email),
      crypt(v_password, gen_salt('bf')), now(),
      '', '', '', '',
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Andreia Maria","username":"andreiamaria4841"}'::jsonb,
      false, false
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           confirmation_token = COALESCE(confirmation_token, ''),
           recovery_token = COALESCE(recovery_token, ''),
           email_change = COALESCE(email_change, ''),
           email_change_token_new = COALESCE(email_change_token_new, ''),
           banned_until = NULL,
           deleted_at = NULL,
           updated_at = now(),
           raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
             || '{"provider":"email","providers":["email"]}'::jsonb
     WHERE id = v_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.identities
    WHERE provider = 'email' AND provider_id = lower(v_email)
  ) THEN
    UPDATE auth.identities
       SET user_id = v_uid,
           identity_data = jsonb_build_object('sub', v_uid::text, 'email', lower(v_email)),
           updated_at = now(),
           last_sign_in_at = now()
     WHERE provider = 'email' AND provider_id = lower(v_email);
  ELSE
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      created_at, updated_at, last_sign_in_at
    ) VALUES (
      gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', lower(v_email)),
      'email', lower(v_email),
      now(), now(), now()
    );
  END IF;
END
$outer$;

DO $outer$
DECLARE
  v_email text := 'andreiamaria4841@gmail.com';
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'Usuária não encontrada em auth.users após hotfix.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='account_status') THEN
    EXECUTE $sql$ UPDATE public.profiles SET account_status='active' WHERE id=$1 OR user_id=$1 $sql$ USING v_uid;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='banned_at') THEN
    EXECUTE $sql$ UPDATE public.profiles SET banned_at=NULL WHERE id=$1 OR user_id=$1 $sql$ USING v_uid;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='ban_reason') THEN
    EXECUTE $sql$ UPDATE public.profiles SET ban_reason=NULL WHERE id=$1 OR user_id=$1 $sql$ USING v_uid;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='is_shadowbanned') THEN
    EXECUTE $sql$ UPDATE public.profiles SET is_shadowbanned=false WHERE id=$1 OR user_id=$1 $sql$ USING v_uid;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='frozen_until') THEN
    EXECUTE $sql$ UPDATE public.profiles SET frozen_until=NULL WHERE id=$1 OR user_id=$1 $sql$ USING v_uid;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='fraud_frozen_until') THEN
    EXECUTE $sql$ UPDATE public.profiles SET fraud_frozen_until=NULL WHERE id=$1 OR user_id=$1 $sql$ USING v_uid;
  END IF;
END
$outer$;

-- Verificação
SELECT
  u.id,
  u.email,
  (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
  (u.deleted_at IS NULL)            AS not_deleted,
  (u.banned_until IS NULL)          AS not_banned
FROM auth.users u
WHERE lower(u.email) = lower('andreiamaria4841@gmail.com');
