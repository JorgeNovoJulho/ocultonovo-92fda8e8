-- =========================================================================
-- 2026-05-20 — REVERSÃO: bombomsex é o verdadeiro
--
-- KEEP: 0cbc6ae6-fe9f-42be-8acf-89fb2eeb7ede  (bombomsex — VERDADEIRO)
-- DROP: cfba5772-dae6-435f-a691-e5a9e63b597c  (agora é o duplicado)
--
-- Estratégia:
--   1) Se auth.users(KEEP) não existir, recriamos copiando do DROP
--      (preserva email, senha, metadata para que o login continue funcionando).
--   2) Se profiles(KEEP) não existir, recriamos copiando do DROP.
--   3) Remapeamos TODAS as colunas *_id (uuid) de DROP -> KEEP.
--   4) Removemos profile do DROP e auth.users do DROP.
--
-- Idempotente.
-- =========================================================================

DO $$
DECLARE
  v_keep uuid := '0cbc6ae6-fe9f-42be-8acf-89fb2eeb7ede';
  v_drop uuid := 'cfba5772-dae6-435f-a691-e5a9e63b597c';
  r record; v_sql text; v_count bigint; v_total_remapped bigint := 0;
  v_keep_auth_exists boolean;
  v_drop_auth_exists boolean;
  v_keep_prof_exists boolean;
  v_drop_prof_exists boolean;
  v_user_cols text[] := ARRAY[
    'user_id','author_id','owner_id','recipient_id','sender_id','creator_id',
    'from_user_id','to_user_id','actor_id','target_user_id','target_id',
    'liker_id','commenter_id','follower_id','following_id',
    'buyer_id','seller_id','blocker_id','blocked_id',
    'host_id','participant_id','inviter_id','invitee_id',
    'profile_id','member_id','reporter_id','reported_user_id'
  ];
BEGIN
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=v_keep) INTO v_keep_auth_exists;
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=v_drop) INTO v_drop_auth_exists;
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_keep OR id=v_keep) INTO v_keep_prof_exists;
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_drop OR id=v_drop) INTO v_drop_prof_exists;

  RAISE NOTICE '=== REVERSÃO  KEEP=% (auth:% prof:%)  DROP=% (auth:% prof:%) ===',
    v_keep, v_keep_auth_exists, v_keep_prof_exists,
    v_drop, v_drop_auth_exists, v_drop_prof_exists;

  -- 1) Garantir auth.users(KEEP)
  IF NOT v_keep_auth_exists THEN
    IF v_drop_auth_exists THEN
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
        recovery_token, recovery_sent_at, email_change_token_new, email_change,
        email_change_sent_at, last_sign_in_at, raw_app_meta_data,
        raw_user_meta_data, is_super_admin, created_at, updated_at,
        phone, phone_confirmed_at, phone_change, phone_change_token,
        phone_change_sent_at, confirmed_at, email_change_token_current,
        email_change_confirm_status, banned_until, reauthentication_token,
        reauthentication_sent_at, is_sso_user, deleted_at
      )
      SELECT
        instance_id, v_keep, aud, role, email, encrypted_password,
        email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
        recovery_token, recovery_sent_at, email_change_token_new, email_change,
        email_change_sent_at, last_sign_in_at, raw_app_meta_data,
        raw_user_meta_data, is_super_admin, created_at, updated_at,
        phone, phone_confirmed_at, phone_change, phone_change_token,
        phone_change_sent_at, confirmed_at, email_change_token_current,
        email_change_confirm_status, banned_until, reauthentication_token,
        reauthentication_sent_at, is_sso_user, deleted_at
      FROM auth.users WHERE id = v_drop;
      RAISE NOTICE 'auth.users(KEEP) recriado a partir do DROP';
      v_keep_auth_exists := true;
    ELSE
      RAISE NOTICE '! auth.users de ambos ausente — criando placeholder mínimo para KEEP';
      INSERT INTO auth.users (instance_id, id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user)
      VALUES ('00000000-0000-0000-0000-000000000000', v_keep, 'authenticated', 'authenticated',
              'bombomsex_restored_' || substr(v_keep::text,1,8) || '@oculto.local',
              now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, false);
      v_keep_auth_exists := true;
    END IF;
  END IF;

  -- 2) Garantir profiles(KEEP)
  IF NOT v_keep_prof_exists AND v_drop_prof_exists THEN
    INSERT INTO public.profiles
    SELECT * FROM public.profiles WHERE user_id = v_drop OR id = v_drop
    LIMIT 1
    ON CONFLICT DO NOTHING;
    -- Ajustes de identidade
    UPDATE public.profiles
       SET id = v_keep,
           user_id = v_keep,
           username = COALESCE(NULLIF(username,''), 'bombomsex')
     WHERE user_id = v_drop AND id <> v_keep;
    RAISE NOTICE 'profiles(KEEP) recriado a partir do DROP';
  END IF;

  -- Em qualquer caso, força o username 'bombomsex' no KEEP se vazio
  UPDATE public.profiles
     SET username = 'bombomsex'
   WHERE user_id = v_keep AND (username IS NULL OR username = '');

  -- 3) Remapear DROP -> KEEP em todas as colunas detectadas
  RAISE NOTICE '=== REMAPEAMENTO % -> % ===', v_drop, v_keep;
  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema=c.table_schema AND t.table_name=c.table_name
     WHERE c.table_schema='public' AND t.table_type='BASE TABLE'
       AND c.data_type='uuid' AND c.column_name = ANY(v_user_cols)
       AND c.table_name <> 'profiles'
     ORDER BY c.table_name, c.column_name
  LOOP
    BEGIN
      v_sql := format('UPDATE public.%I SET %I = $1 WHERE %I = $2',
                      r.table_name, r.column_name, r.column_name);
      EXECUTE v_sql USING v_keep, v_drop;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        v_total_remapped := v_total_remapped + v_count;
        RAISE NOTICE '   UPDATE %.% : % linhas', r.table_name, r.column_name, v_count;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        BEGIN
          v_sql := format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name);
          EXECUTE v_sql USING v_drop;
          GET DIAGNOSTICS v_count = ROW_COUNT;
          RAISE NOTICE '   DELETE conflito %.% : % linhas', r.table_name, r.column_name, v_count;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE '   ! falha cleanup %.% : %', r.table_name, r.column_name, SQLERRM;
        END;
      WHEN OTHERS THEN
        RAISE NOTICE '   ! erro %.% : %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Total remapeado: %', v_total_remapped;

  -- 4) Remover profile do DROP
  DELETE FROM public.profiles WHERE user_id = v_drop OR id = v_drop;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'profiles deletados (DROP): %', v_count;

  -- 5) Remover auth.users do DROP
  BEGIN
    DELETE FROM auth.users WHERE id = v_drop;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'auth.users deletados (DROP): %', v_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '! auth.users(DROP) não removido: %', SQLERRM;
  END;

  RAISE NOTICE '=== FIM ===';
END $$;

NOTIFY pgrst, 'reload schema';
