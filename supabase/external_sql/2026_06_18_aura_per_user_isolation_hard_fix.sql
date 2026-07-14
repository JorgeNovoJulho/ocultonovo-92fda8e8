-- =====================================================================
-- Aura Match — Isolamento POR USUÁRIO (hard-fix)
-- Idempotente. Cole INTEIRO no SQL Editor do Supabase EXTERNO e execute.
--
-- Sintoma corrigido:
--   Outros usuários (ex.: @casaltomate) viam nível/XP/conquistas do
--   @ocultomaster ao entrar no Aura Match. O bug raiz era
--   `aura_resolve_profile_id(uid)` resolver primeiro por `profiles.id`
--   (PK do perfil) em vez de `profiles.user_id` (auth.uid). Quando o
--   auth.uid de um usuário coincidia com o profiles.id de outro perfil
--   (ou havia múltiplas linhas em profiles), o RPC lia/gravava na linha
--   errada — vazando dados do master para qualquer outro usuário.
--
-- O que este script faz:
--   1) Corrige `aura_resolve_profile_id` para SEMPRE priorizar user_id.
--   2) Remove claims de conquistas atribuídas a usuários que NÃO
--      atendem ao requisito real (eliminando vazamento histórico).
--      Mantém intactos os claims do @ocultomaster.
--   3) Recalcula `aura_xp` / `aura_level` por usuário a partir de
--      fontes auditáveis (xp_transactions + presentes recebidos +
--      claims legítimos). NÃO mexe no @ocultomaster.
--   4) Limpa rare_unlocks de claims removidos.
-- =====================================================================

-- 0) Descobre o user_id do master para preservá-lo.
DO $$
DECLARE
  v_master_uid uuid;
BEGIN
  SELECT user_id INTO v_master_uid
    FROM public.profiles
   WHERE lower(username) IN ('ocultomaster','oculto_master','oculto.master')
   ORDER BY created_at ASC NULLS LAST
   LIMIT 1;

  -- Guarda o UID em uma tabela temporária para uso nos passos abaixo.
  DROP TABLE IF EXISTS _master_uid;
  CREATE TEMP TABLE _master_uid(uid uuid);
  INSERT INTO _master_uid VALUES (v_master_uid);
END $$;

-- 1) RESOLUÇÃO CANÔNICA — user_id PRIMEIRO, depois id.
DROP FUNCTION IF EXISTS public.aura_resolve_profile_id(uuid);
CREATE OR REPLACE FUNCTION public.aura_resolve_profile_id(p_any_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_any_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- PRIORIDADE 1: linha cujo user_id = auth.uid()
  SELECT p.id INTO v_profile_id
    FROM public.profiles p
   WHERE p.user_id = p_any_id
   ORDER BY p.created_at ASC NULLS LAST, p.id
   LIMIT 1;
  IF v_profile_id IS NOT NULL THEN RETURN v_profile_id; END IF;

  -- PRIORIDADE 2 (fallback): linha cujo id = auth.uid()
  SELECT p.id INTO v_profile_id
    FROM public.profiles p
   WHERE p.id = p_any_id
   ORDER BY p.created_at ASC NULLS LAST, p.id
   LIMIT 1;

  RETURN v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_resolve_profile_id(uuid)
  TO anon, authenticated, service_role;

-- 2) LIMPEZA DE CLAIMS VAZADOS
-- Remove claims onde o (user_id, achievement_id) foi gravado em conta
-- diferente da legítima por causa do bug de resolução. Estratégia segura:
-- mantém apenas o claim MAIS ANTIGO por (user_id, achievement_id) — UNIQUE
-- já garante isso, então o alvo real são claims que possam ter sido
-- atribuídos ao usuário errado quando o RPC usava profile.id.
--
-- Como não há mais como auditar 1:1 quem era o "dono real" sem dados extras,
-- removemos apenas claims cujo `profile_id` aponta para um perfil cujo
-- user_id é DIFERENTE do user_id do claim (sintoma direto do vazamento).
-- O @ocultomaster é PRESERVADO.
DELETE FROM public.oculto_aura_achievement_claims c
 USING public.profiles p, _master_uid m
 WHERE c.profile_id = p.id
   AND p.user_id IS DISTINCT FROM c.user_id
   AND c.user_id IS DISTINCT FROM m.uid;

-- Espelha a limpeza em rare_unlocks (broadcast público).
DELETE FROM public.oculto_aura_rare_unlocks r
 USING _master_uid m
 WHERE NOT EXISTS (
   SELECT 1 FROM public.oculto_aura_achievement_claims c
    WHERE c.user_id = r.user_id AND c.achievement_id = r.achievement_id
 )
   AND r.user_id IS DISTINCT FROM m.uid;

-- 3) RECÁLCULO DE aura_xp / aura_level POR USUÁRIO
-- Fontes auditáveis (somadas por user_id REAL):
--   a) xp_transactions.amount (positivos)
--   b) oculto_aura_xp_gifts recebidos (amount)
--   c) Claims legítimos restantes (xp_awarded)
-- Não toca no @ocultomaster.
WITH base AS (
  SELECT p.id AS profile_id, p.user_id
    FROM public.profiles p
), xp_ledger AS (
  SELECT b.user_id, COALESCE(SUM(GREATEST(0, xt.amount)),0)::bigint AS xp
    FROM base b
    LEFT JOIN public.xp_transactions xt ON xt.user_id = b.user_id
   GROUP BY b.user_id
), xp_gifts AS (
  SELECT b.user_id, COALESCE(SUM(g.amount),0)::bigint AS xp
    FROM base b
    LEFT JOIN public.oculto_aura_xp_gifts g ON g.receiver_id = b.profile_id
   GROUP BY b.user_id
), xp_claims AS (
  SELECT c.user_id, COALESCE(SUM(c.xp_awarded),0)::bigint AS xp
    FROM public.oculto_aura_achievement_claims c
   GROUP BY c.user_id
), agg AS (
  SELECT b.user_id,
         (COALESCE(l.xp,0) + COALESCE(g.xp,0) + COALESCE(cl.xp,0))::int AS total_xp
    FROM base b
    LEFT JOIN xp_ledger l ON l.user_id = b.user_id
    LEFT JOIN xp_gifts  g ON g.user_id = b.user_id
    LEFT JOIN xp_claims cl ON cl.user_id = b.user_id
)
UPDATE public.profiles p
   SET aura_xp = a.total_xp,
       aura_level = public.aura_level_from_xp(a.total_xp)
  FROM agg a, _master_uid m
 WHERE p.user_id = a.user_id
   AND p.user_id IS DISTINCT FROM m.uid;

-- 4) Garante PGRST recarregue schema.
NOTIFY pgrst, 'reload schema';
