-- =====================================================================
-- RPC pública: comunidades das quais um usuário é MEMBRO ATIVO.
-- Visível a qualquer visitante (anon/authenticated) — contorna a RLS
-- restritiva de oculto_community_members via SECURITY DEFINER.
--
-- Regras:
--   • só lista comunidades com status='active';
--   • esconde comunidades privadas (visibility='private');
--   • exclui comunidades em que o usuário é DONO (já mostradas em
--     "Comunidades que administra");
--   • exclui status banned/left.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.oculto_user_public_memberships(
  p_user_id uuid,
  p_limit   int DEFAULT 24
)
RETURNS TABLE (
  id             uuid,
  slug           text,
  title          text,
  description    text,
  avatar_url     text,
  cover_url      text,
  accent_color   text,
  visibility     text,
  is_adult       boolean,
  members_count  int,
  joined_at      timestamptz,
  role           text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.slug,
    c.title,
    c.description,
    c.avatar_url,
    c.cover_url,
    c.accent_color,
    c.visibility,
    c.is_adult,
    c.members_count,
    m.joined_at,
    m.role
  FROM public.oculto_community_members m
  JOIN public.oculto_communities       c ON c.id = m.community_id
  WHERE m.user_id = p_user_id
    AND m.status   = 'active'
    AND c.status   = 'active'
    AND COALESCE(c.visibility, 'public') <> 'private'
    AND c.owner_id <> p_user_id
  ORDER BY m.joined_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 24), 60));
$$;

GRANT EXECUTE ON FUNCTION public.oculto_user_public_memberships(uuid, int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
