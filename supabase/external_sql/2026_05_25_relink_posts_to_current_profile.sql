-- =====================================================================
-- 2026-05-25 — Relink de posts ao profile.id canônico atual (defensivo)
--
-- Detecta dinamicamente se `public.posts` tem `author_id`, `user_id` e/ou
-- `creator_id` e re-vincula todos os posts ao profile MAIS RECENTE de cada
-- auth.users.id. Idempotente. Não apaga nada.
--
-- Como rodar: cole inteiro no SQL Editor do Supabase externo e execute.
-- =====================================================================

DO $$
DECLARE
  has_author     boolean;
  has_user       boolean;
  has_creator    boolean;
  owner_col      text;     -- coluna em posts que aponta para auth.users (user_id ou creator_id)
  link_col       text;     -- coluna em posts que aponta para profiles.id (author_id) — pode ser NULL
  v_updated      integer;
  v_orphans      integer;
  v_sql          text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='author_id'
  ) INTO has_author;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='user_id'
  ) INTO has_user;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='creator_id'
  ) INTO has_creator;

  RAISE NOTICE 'posts columns -> author_id=% user_id=% creator_id=%', has_author, has_user, has_creator;

  -- Owner em auth.users: preferimos creator_id, depois user_id
  IF has_creator THEN
    owner_col := 'creator_id';
  ELSIF has_user THEN
    owner_col := 'user_id';
  ELSE
    RAISE NOTICE 'Nenhuma coluna de owner encontrada em posts. Nada a fazer.';
    RETURN;
  END IF;

  -- Coluna que liga para profiles.id (que queremos atualizar)
  IF has_author THEN
    link_col := 'author_id';
  ELSE
    link_col := NULL;
  END IF;

  -- Tabela auxiliar de profile canônico por auth user (mais recente)
  DROP TABLE IF EXISTS _tmp_canonical_profiles;
  CREATE TEMP TABLE _tmp_canonical_profiles AS
  SELECT DISTINCT ON (user_id)
         user_id  AS auth_user_id,
         id       AS profile_id
    FROM public.profiles
   WHERE user_id IS NOT NULL
   ORDER BY user_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST;

  CREATE INDEX ON _tmp_canonical_profiles (auth_user_id);

  -- 1) Caso A: existe author_id => atualizá-lo para o profile canônico
  IF link_col = 'author_id' THEN
    v_sql := format($f$
      WITH owner_map AS (
        SELECT p.id AS post_id,
               COALESCE(
                 (SELECT user_id FROM public.profiles WHERE id = p.author_id),
                 p.%I
               ) AS auth_user_id
          FROM public.posts p
      )
      UPDATE public.posts pp
         SET author_id = c.profile_id,
             updated_at = COALESCE(pp.updated_at, now())
        FROM owner_map om
        JOIN _tmp_canonical_profiles c ON c.auth_user_id = om.auth_user_id
       WHERE pp.id = om.post_id
         AND c.profile_id IS NOT NULL
         AND (pp.author_id IS DISTINCT FROM c.profile_id);
    $f$, owner_col);

    EXECUTE v_sql;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'author_id relinkado em % posts.', v_updated;

    -- Contagem de órfãos remanescentes
    EXECUTE $f$
      SELECT count(*) FROM public.posts p
      LEFT JOIN public.profiles pr ON pr.id = p.author_id
      WHERE pr.id IS NULL
    $f$ INTO v_orphans;
    RAISE NOTICE 'Posts com author_id órfão (sem profile): %', v_orphans;
  END IF;

  -- 2) Caso B: posts.user_id que (legado) guarda profiles.id em vez de auth.users.id
  --    Detectamos isso quando posts.user_id existe em profiles.id mas NÃO existe em profiles.user_id.
  IF has_user THEN
    v_sql := $f$
      WITH bad AS (
        SELECT p.id AS post_id,
               pr_by_id.user_id AS real_auth_user
          FROM public.posts p
          JOIN public.profiles pr_by_id ON pr_by_id.id = p.user_id
          LEFT JOIN public.profiles pr_by_user ON pr_by_user.user_id = p.user_id
         WHERE pr_by_user.id IS NULL
           AND pr_by_id.user_id IS NOT NULL
      )
      UPDATE public.posts pp
         SET user_id = b.real_auth_user,
             updated_at = COALESCE(pp.updated_at, now())
        FROM bad b
       WHERE pp.id = b.post_id;
    $f$;
    EXECUTE v_sql;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'posts.user_id normalizado para auth.users.id em % linhas.', v_updated;
  END IF;

  DROP TABLE IF EXISTS _tmp_canonical_profiles;
END $$;
