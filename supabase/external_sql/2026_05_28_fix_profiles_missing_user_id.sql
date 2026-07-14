-- =====================================================================
-- REPARO: 6 perfis com user_id NULL (impedem login -> 504 aparente)
-- Projeto externo: rvybbrkzmboqbhcemqar
-- IDEMPOTENTE — pode rodar várias vezes.
-- =====================================================================

BEGIN;

-- 1) Diagnóstico ANTES
SELECT 'ANTES' AS momento,
       count(*)                                   AS perfis_total,
       count(*) FILTER (WHERE user_id IS NULL)    AS perfis_sem_user_id,
       count(*) FILTER (WHERE id = user_id)       AS profiles_id_equals_user_id
FROM public.profiles;

-- 2) Lista dos órfãos (pra você ver quem são)
SELECT p.id, p.username, p.name, p.created_at,
       (SELECT email FROM auth.users u WHERE u.id = p.id) AS email_match_by_id
FROM public.profiles p
WHERE p.user_id IS NULL
ORDER BY p.created_at ASC NULLS LAST;

-- 3) REPARO #1: se o profiles.id bate com um auth.users.id, preenche user_id
UPDATE public.profiles p
SET user_id = p.id,
    updated_at = now()
FROM auth.users u
WHERE p.user_id IS NULL
  AND u.id = p.id;

-- 4) REPARO #2: tenta casar pelo email do auth.users com profiles.username/email
--    (só se sobrou alguém após o passo 3)
UPDATE public.profiles p
SET user_id = u.id,
    updated_at = now()
FROM auth.users u
WHERE p.user_id IS NULL
  AND lower(u.email) IS NOT NULL
  AND (
        lower(u.email) = lower(coalesce(p.username, ''))
     OR split_part(lower(u.email), '@', 1) = lower(coalesce(p.username, ''))
  );

-- 5) Garante que id = user_id quando ambos existem (regra do app)
UPDATE public.profiles
SET id = user_id, updated_at = now()
WHERE user_id IS NOT NULL
  AND id <> user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p2
    WHERE p2.id = public.profiles.user_id
      AND p2.id <> public.profiles.id
  );

-- 6) Índice para impedir novos órfãos sem user_id em buscas
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_not_null
  ON public.profiles(user_id) WHERE user_id IS NOT NULL;

-- 7) Diagnóstico DEPOIS
SELECT 'DEPOIS' AS momento,
       count(*)                                   AS perfis_total,
       count(*) FILTER (WHERE user_id IS NULL)    AS perfis_sem_user_id,
       count(*) FILTER (WHERE id = user_id)       AS profiles_id_equals_user_id
FROM public.profiles;

-- 8) Quem AINDA está órfão (precisa de decisão manual — deletar ou recriar via auth)
SELECT 'ORFAOS_RESTANTES' AS status, p.id, p.username, p.name, p.created_at
FROM public.profiles p
WHERE p.user_id IS NULL
ORDER BY p.created_at ASC NULLS LAST;

COMMIT;

-- =====================================================================
-- AÇÃO RECOMENDADA para os órfãos restantes (rodar manualmente após revisar):
--
--   DELETE FROM public.profiles WHERE user_id IS NULL;
--
-- Esses perfis NÃO têm conta de auth correspondente — são lixo de migração
-- antiga e não pertencem a nenhum usuário que consiga logar.
-- =====================================================================
