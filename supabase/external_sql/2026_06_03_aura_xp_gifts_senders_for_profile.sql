-- =====================================================================
-- RPC pública: lista os remetentes de presentes XP recebidos por um perfil.
-- Retorna remetente (perfil), total enviado, contagem de presentes e
-- data do último presente. Ordenado por último presente desc.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_xp_gifts_senders_for_profile(
  p_profile_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  sender_profile_id uuid,
  sender_user_id    uuid,
  username          text,
  name              text,
  avatar_url        text,
  total_xp          integer,
  gifts_count       integer,
  last_sent_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH target AS (
    SELECT id, user_id
      FROM public.profiles
     WHERE id = p_profile_id OR user_id = p_profile_id
     LIMIT 1
  ),
  raw AS (
    SELECT g.sender_id, g.amount, g.created_at
      FROM public.oculto_aura_xp_gifts g, target t
     WHERE g.receiver_id = t.id
        OR (t.user_id IS NOT NULL AND g.receiver_id = t.user_id)
  ),
  agg AS (
    SELECT sender_id,
           SUM(amount)::int       AS total_xp,
           COUNT(*)::int          AS gifts_count,
           MAX(created_at)        AS last_sent_at
      FROM raw
     GROUP BY sender_id
  )
  SELECT p.id           AS sender_profile_id,
         p.user_id      AS sender_user_id,
         p.username,
         p.name,
         p.avatar_url,
         a.total_xp,
         a.gifts_count,
         a.last_sent_at
    FROM agg a
    LEFT JOIN public.profiles p
           ON p.id = a.sender_id OR p.user_id = a.sender_id
   ORDER BY a.last_sent_at DESC NULLS LAST
   LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_gifts_senders_for_profile(uuid, integer)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
