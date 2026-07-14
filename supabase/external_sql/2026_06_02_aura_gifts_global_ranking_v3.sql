-- =====================================================================
-- 2026-06-02 — RPC aura_gifts_global_ranking (v3)
-- Top N global de quem MAIS RECEBE presentes — somando TODAS as origens:
--   • profiles.gifts_received_count  ← fonte canônica (mantida por
--     triggers que disparam em feed/posts/boas-vindas/master/chat/
--     discovery/PPV/etc). É o MESMO número exibido no card "Boas-vindas".
--   • oculto_aura_xp_gifts            ← total_xp de gifts XP
--   • gift_history (is_visible)       ← total_xp de gifts do chat
--
-- Antes (v2) a contagem usava apenas COUNT() das 2 tabelas acima,
-- o que ficava menor que o badge da seção "Boas-vindas" sempre que
-- existiam presentes de outras origens (discovery/post/ppv).
--
-- Ordenação: gifts_count DESC, total_xp DESC, profile_id ASC.
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

DROP FUNCTION IF EXISTS public.aura_gifts_global_ranking(integer);

CREATE OR REPLACE FUNCTION public.aura_gifts_global_ranking(p_limit integer DEFAULT 20)
RETURNS TABLE (
  profile_id     uuid,
  user_id        uuid,
  username       text,
  name           text,
  avatar_url     text,
  profile_type   text,
  address_city   text,
  address_state  text,
  total_xp       bigint,
  gifts_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH aura AS (
    SELECT receiver_id, COALESCE(amount,0)::bigint AS amount
      FROM public.oculto_aura_xp_gifts
  ),
  chat AS (
    SELECT receiver_id, COALESCE(amount,0)::bigint AS amount
      FROM public.gift_history
     WHERE is_visible IS DISTINCT FROM false
  ),
  raw_all AS (
    SELECT * FROM aura
    UNION ALL
    SELECT * FROM chat
  ),
  -- Resolve cada receiver_id em uma identidade canônica (profile.id)
  resolved AS (
    SELECT
      COALESCE(p.id, r.receiver_id) AS canonical_id,
      r.amount
    FROM raw_all r
    LEFT JOIN public.profiles p
      ON p.id = r.receiver_id OR p.user_id = r.receiver_id
  ),
  xp_agg AS (
    SELECT canonical_id, SUM(amount)::bigint AS total_xp
      FROM resolved
     GROUP BY canonical_id
  ),
  -- Fonte canônica de CONTAGEM: profiles.gifts_received_count
  base AS (
    SELECT
      p.id          AS profile_id,
      p.user_id,
      p.username,
      p.name,
      p.avatar_url,
      p.profile_type,
      p.address_city,
      p.address_state,
      COALESCE(p.gifts_received_count, 0)::bigint AS gifts_count,
      COALESCE(x.total_xp, 0)::bigint             AS total_xp
    FROM public.profiles p
    LEFT JOIN xp_agg x ON x.canonical_id = p.id
    WHERE COALESCE(p.is_seed, false) = false
      AND (
        COALESCE(p.gifts_received_count, 0) > 0
        OR COALESCE(x.total_xp, 0) > 0
      )
  )
  SELECT *
    FROM base
   ORDER BY gifts_count DESC, total_xp DESC, profile_id ASC
   LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;

REVOKE ALL ON FUNCTION public.aura_gifts_global_ranking(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_gifts_global_ranking(integer)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
