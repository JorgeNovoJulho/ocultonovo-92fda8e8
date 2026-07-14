-- =====================================================================
-- REPARO: perfis duplicados criados pelo bug do botão "Atualizar WebApp"
-- =====================================================================
-- Bug: useProfile.tsx, no ramo "perfil não encontrado", fazia um
-- upsert com `id = auth.user.id` e avatar_url/banner_url = NULL,
-- gerando uma SEGUNDA linha em public.profiles para o mesmo
-- user_id após cada "Atualizar agora". Esta linha duplicada (sem
-- fotos) era depois retornada pela consulta por user_id, fazendo
-- "sumir" avatar e banner do usuário logado.
--
-- Este script:
--   1) Identifica usuários com >1 linha em profiles (mesmo user_id).
--   2) Mantém a linha "mais rica" (com avatar_url/banner_url não nulos
--      e/ou mais antiga) e copia campos faltantes da duplicata.
--   3) Remove as duplicatas órfãs.
--
-- IDEMPOTENTE: pode rodar várias vezes com segurança.
-- =====================================================================

BEGIN;

WITH ranked AS (
  SELECT
    p.id,
    p.user_id,
    p.avatar_url,
    p.banner_url,
    p.cover_image_url,
    p.bio,
    p.username,
    p.full_name,
    p.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY p.user_id
      ORDER BY
        (CASE WHEN p.avatar_url IS NOT NULL AND p.avatar_url <> '' THEN 0 ELSE 1 END),
        (CASE WHEN p.banner_url IS NOT NULL AND p.banner_url <> '' THEN 0 ELSE 1 END),
        (CASE WHEN p.bio IS NOT NULL AND p.bio <> '' THEN 0 ELSE 1 END),
        p.created_at ASC NULLS LAST
    ) AS rn
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL
),
keepers AS (
  SELECT user_id, id AS keeper_id FROM ranked WHERE rn = 1
),
losers AS (
  SELECT user_id, id AS loser_id FROM ranked WHERE rn > 1
),
merged AS (
  -- Copia campos faltantes do keeper a partir das duplicatas
  UPDATE public.profiles k
  SET
    avatar_url      = COALESCE(NULLIF(k.avatar_url, ''),      l.avatar_url),
    banner_url      = COALESCE(NULLIF(k.banner_url, ''),      l.banner_url),
    cover_image_url = COALESCE(NULLIF(k.cover_image_url, ''), l.cover_image_url),
    bio             = COALESCE(NULLIF(k.bio, ''),             l.bio),
    full_name       = COALESCE(NULLIF(k.full_name, ''),       l.full_name)
  FROM losers ll
  JOIN public.profiles l ON l.id = ll.loser_id
  JOIN keepers kk ON kk.user_id = ll.user_id
  WHERE k.id = kk.keeper_id
  RETURNING k.id
)
SELECT count(*) AS perfis_reparados FROM merged;

-- Remove as linhas duplicadas (mantém apenas o "keeper")
DELETE FROM public.profiles p
USING (
  SELECT id FROM (
    SELECT
      id,
      user_id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY
          (CASE WHEN avatar_url IS NOT NULL AND avatar_url <> '' THEN 0 ELSE 1 END),
          (CASE WHEN banner_url IS NOT NULL AND banner_url <> '' THEN 0 ELSE 1 END),
          (CASE WHEN bio        IS NOT NULL AND bio        <> '' THEN 0 ELSE 1 END),
          created_at ASC NULLS LAST
      ) AS rn
    FROM public.profiles
    WHERE user_id IS NOT NULL
  ) x
  WHERE x.rn > 1
) d
WHERE p.id = d.id;

COMMIT;

-- Diagnóstico (rodar manualmente após o COMMIT):
-- SELECT user_id, COUNT(*) AS n
-- FROM public.profiles
-- WHERE user_id IS NOT NULL
-- GROUP BY user_id HAVING COUNT(*) > 1;
