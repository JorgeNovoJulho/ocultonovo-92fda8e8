-- =====================================================================
-- FIX AUTHORIA DE POSTS — BomBomSex + regra geral para todos os usuários
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- Objetivos:
--   1) Garantir que o perfil "BomBomSex" tenha nome/username/avatar válidos
--      e esteja vinculado ao auth.user andreiamaria4841@gmail.com.
--   2) Reapontar quaisquer posts órfãos (author_id que não existe em
--      profiles.id) para o profile correto do criador, usando creator_id.
--   3) Garantir que a tabela profiles seja legível publicamente (anon/auth)
--      para o feed conseguir resolver autor — sem isso o card aparece como
--      "Usuário / @usuario" mesmo com author_id correto.
--   4) Trigger preventivo: bloquear inserts em posts cujo author_id
--      não corresponde a um profile real, forçando o app a sempre vincular
--      ao profile correto do criador logado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Diagnóstico inicial
-- ---------------------------------------------------------------------
SELECT 'AUTH'      AS tipo, id::text, email, email_confirmed_at::text
FROM   auth.users WHERE lower(email)='andreiamaria4841@gmail.com'
UNION ALL
SELECT 'PROFILE',  id::text, COALESCE(user_id::text,'(null)'),
       COALESCE(username,'(null)') || ' / ' || COALESCE(name,'(null)') ||
       ' / avatar=' || COALESCE(avatar_url,'(null)')
FROM   public.profiles
WHERE  lower(username) = lower('BomBomSex');

SELECT 'POSTS_BOMBOMSEX' AS tipo, p.id::text, p.author_id::text,
       COALESCE(p.creator_id::text,'(null)') AS creator_id,
       LEFT(COALESCE(p.content_text,''),60)  AS preview
FROM   public.posts p
JOIN   public.profiles pr
       ON pr.id = p.author_id
       OR pr.user_id = COALESCE(p.creator_id, p.author_id)
WHERE  lower(pr.username) = lower('BomBomSex')
ORDER  BY p.created_at DESC NULLS LAST
LIMIT  20;

-- ---------------------------------------------------------------------
-- 2) Reforça campos visíveis do BomBomSex (não sobrescreve se já preenchidos)
-- ---------------------------------------------------------------------
DO $b$
DECLARE
  v_auth_uid uuid;
BEGIN
  SELECT id INTO v_auth_uid
  FROM   auth.users
  WHERE  lower(email)='andreiamaria4841@gmail.com'
  LIMIT  1;

  IF v_auth_uid IS NOT NULL THEN
    UPDATE public.profiles
       SET user_id    = v_auth_uid,
           username   = COALESCE(NULLIF(username,''), 'BomBomSex'),
           name       = COALESCE(NULLIF(name,''),     'BomBomSex'),
           updated_at = now()
     WHERE lower(username) = lower('BomBomSex');
  END IF;
END $b$;

-- ---------------------------------------------------------------------
-- 3) Reapontar posts órfãos
--    Para cada post cujo author_id não bate com nenhum profiles.id,
--    tenta resolver pelo creator_id (auth.uid -> profiles.user_id).
-- ---------------------------------------------------------------------
WITH alvo AS (
  SELECT p.id AS post_id, pr.id AS new_author_id
  FROM   public.posts p
  LEFT   JOIN public.profiles pr_atual ON pr_atual.id = p.author_id
  LEFT   JOIN public.profiles pr       ON pr.user_id = p.creator_id
  WHERE  pr_atual.id IS NULL
    AND  p.creator_id IS NOT NULL
    AND  pr.id IS NOT NULL
)
UPDATE public.posts p
   SET author_id = a.new_author_id
  FROM alvo a
 WHERE p.id = a.post_id;

-- 3.1) Fallback: posts sem creator_id mas com author_id apontando para
--      auth.uid (legacy). Procura o profile por user_id e corrige.
WITH legacy AS (
  SELECT p.id AS post_id, pr.id AS new_author_id
  FROM   public.posts p
  LEFT   JOIN public.profiles pr_atual ON pr_atual.id = p.author_id
  LEFT   JOIN public.profiles pr       ON pr.user_id = p.author_id
  WHERE  pr_atual.id IS NULL
    AND  pr.id IS NOT NULL
)
UPDATE public.posts p
   SET author_id = l.new_author_id,
       creator_id = COALESCE(p.creator_id, p.author_id)
  FROM legacy l
 WHERE p.id = l.post_id;

-- ---------------------------------------------------------------------
-- 4) RLS pública de leitura em profiles (necessária para o feed)
--    Mantém qualquer política existente; só adiciona se faltar.
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $r$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='profiles_public_read'
  ) THEN
    CREATE POLICY "profiles_public_read"
      ON public.profiles
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $r$;

-- ---------------------------------------------------------------------
-- 5) Trigger preventivo: garante que todo INSERT em posts tenha
--    author_id válido. Se vier inválido, tenta resolver pelo
--    creator_id automaticamente; se falhar, levanta erro descritivo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.posts_enforce_author_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_profile_id uuid;
BEGIN
  -- Se author_id já é um profile válido, nada a fazer.
  IF NEW.author_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.author_id) THEN
    RETURN NEW;
  END IF;

  -- Resolve pelo creator_id (auth.uid)
  IF NEW.creator_id IS NOT NULL THEN
    SELECT id INTO v_profile_id
    FROM   public.profiles
    WHERE  user_id = NEW.creator_id
    LIMIT  1;

    IF v_profile_id IS NULL THEN
      SELECT id INTO v_profile_id
      FROM   public.profiles
      WHERE  id = NEW.creator_id
      LIMIT  1;
    END IF;
  END IF;

  -- Última tentativa: usar auth.uid() corrente
  IF v_profile_id IS NULL THEN
    SELECT id INTO v_profile_id
    FROM   public.profiles
    WHERE  user_id = auth.uid()
    LIMIT  1;
  END IF;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION
      'posts.author_id inválido e nenhum profile encontrado para creator_id=% / auth.uid()=%',
      NEW.creator_id, auth.uid();
  END IF;

  NEW.author_id := v_profile_id;
  IF NEW.creator_id IS NULL THEN
    NEW.creator_id := auth.uid();
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_posts_enforce_author_id ON public.posts;
CREATE TRIGGER trg_posts_enforce_author_id
BEFORE INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_enforce_author_id();

-- ---------------------------------------------------------------------
-- 6) Verificação final
-- ---------------------------------------------------------------------
SELECT 'ORFAOS_RESTANTES' AS tipo, COUNT(*)::text AS info1, NULL::text AS info2
FROM   public.posts p
LEFT   JOIN public.profiles pr ON pr.id = p.author_id
WHERE  pr.id IS NULL;

SELECT 'BOMBOMSEX_FINAL' AS tipo, id::text AS info1,
       COALESCE(user_id::text,'(null)') AS info2,
       (username||' / '||COALESCE(name,'(null)')) AS info3
FROM   public.profiles
WHERE  lower(username)=lower('BomBomSex');
