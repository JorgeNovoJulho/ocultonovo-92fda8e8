-- =====================================================================
-- 2026-06-02 — RPC aura_gifts_global_ranking
-- Retorna o Top N global de quem MAIS RECEBE presentes, somando:
--   • oculto_aura_xp_gifts (feed/posts/boas-vindas/master)
--   • gift_history         (presentes do chat — apenas is_visible)
-- Resolve receiver_id como auth.uid OU profile.id (identidade canônica)
-- e retorna apenas colunas públicas de profiles (sem PII).
--
-- SECURITY DEFINER porque os clientes têm RLS restritivo nessas tabelas
-- (cada usuário só vê seus próprios gifts). Sem isso a agregação fica
-- truncada e o ranking sai errado.
--
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

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
  agg AS (
    SELECT canonical_id,
           SUM(amount)::bigint  AS total_xp,
           COUNT(*)::bigint     AS gifts_count
      FROM resolved
     GROUP BY canonical_id
      ORDER BY gifts_count DESC, total_xp DESC, canonical_id ASC
     LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  )
  SELECT
    p.id            AS profile_id,
    p.user_id,
    p.username,
    p.name,
    p.avatar_url,
    p.profile_type,
    p.address_city,
    p.address_state,
    a.total_xp,
    a.gifts_count
  FROM agg a
  LEFT JOIN public.profiles p ON p.id = a.canonical_id
  ORDER BY a.gifts_count DESC, a.total_xp DESC, a.canonical_id ASC;
$$;

REVOKE ALL ON FUNCTION public.aura_gifts_global_ranking(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_gifts_global_ranking(integer)
  TO authenticated, anon, service_role;
