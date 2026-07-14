-- ============================================================
-- aura_room_recent_messages V2 — inclui gender / profile_type
-- Necessário DROP por mudança de RETURNS TABLE.
-- Idempotente.
-- ============================================================

DROP FUNCTION IF EXISTS public.aura_room_recent_messages(text, int);

CREATE OR REPLACE FUNCTION public.aura_room_recent_messages(
  p_slug  text,
  p_limit int DEFAULT 40
)
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  body         text,
  created_at   timestamptz,
  name         text,
  username     text,
  avatar_url   text,
  plan_type    text,
  is_verified  boolean,
  profile_type text,
  gender       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.user_id, m.body, m.created_at,
    p.name, p.username, p.avatar_url, p.plan_type, p.is_verified,
    p.profile_type,
    COALESCE(NULLIF(p.gender, ''), p.profile_type) AS gender
  FROM public.oculto_aura_room_messages m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.room_slug = p_slug
    AND m.created_at > now() - interval '6 hours'
  ORDER BY m.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 40), 80));
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_recent_messages(text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
