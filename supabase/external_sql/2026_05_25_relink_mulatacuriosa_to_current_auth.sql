-- =====================================================================
-- Re-vincula o perfil @mulatacuriosa_ofc (legado: @bionca / @mulatacuriosa)
-- ao auth.user atualmente em uso (andreiamaria6230@gmail.com).
--
-- Observação importante: a tabela public.posts usa a coluna `author_id`
-- (FK -> profiles.id), NÃO `user_id`. A versão anterior deste script
-- quebrou justamente por referenciar `posts.user_id` (que não existe).
--
-- Idempotente: pode rodar várias vezes sem efeito colateral.
-- =====================================================================

DO $$
DECLARE
  v_new_auth           uuid;
  v_target_profile     uuid;
  v_canonical_username text   := 'mulatacuriosa_ofc';
  v_legacy_usernames   text[] := ARRAY['mulatacuriosa_ofc','mulatacuriosa','bionca'];
  v_relinked_posts     int    := 0;
BEGIN
  -- 1) auth.user atual (conta em uso hoje)
  SELECT id INTO v_new_auth
    FROM auth.users
   WHERE lower(email) = 'andreiamaria6230@gmail.com'
   LIMIT 1;

  IF v_new_auth IS NULL THEN
    RAISE NOTICE '[relink] auth.user andreiamaria6230@gmail.com não encontrado — abortando';
    RETURN;
  END IF;

  -- 2) Profile mais recente com um dos usernames conhecidos
  SELECT id INTO v_target_profile
    FROM public.profiles
   WHERE lower(username) = ANY (v_legacy_usernames)
   ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
   LIMIT 1;

  IF v_target_profile IS NULL THEN
    INSERT INTO public.profiles (user_id, username, name, created_at, updated_at)
    VALUES (v_new_auth, v_canonical_username, 'Andreia Maria', now(), now())
    RETURNING id INTO v_target_profile;
    RAISE NOTICE '[relink] profile criado: %', v_target_profile;
  ELSE
    UPDATE public.profiles
       SET user_id    = v_new_auth,
           username   = v_canonical_username,
           updated_at = now()
     WHERE id = v_target_profile;
    RAISE NOTICE '[relink] profile re-vinculado: % -> auth %', v_target_profile, v_new_auth;
  END IF;

  -- 3) Re-linka posts órfãos: posts.author_id (FK -> profiles.id)
  UPDATE public.posts p
     SET author_id = v_target_profile
   WHERE p.author_id IN (
           SELECT id FROM public.profiles
            WHERE lower(username) = ANY (v_legacy_usernames)
         )
     AND p.author_id <> v_target_profile;
  GET DIAGNOSTICS v_relinked_posts = ROW_COUNT;
  RAISE NOTICE '[relink] posts re-vinculados: %', v_relinked_posts;

  -- 4) Remove profiles duplicados (mantém apenas o canônico)
  DELETE FROM public.profiles
   WHERE lower(username) = ANY (v_legacy_usernames)
     AND id <> v_target_profile;

END $$;
