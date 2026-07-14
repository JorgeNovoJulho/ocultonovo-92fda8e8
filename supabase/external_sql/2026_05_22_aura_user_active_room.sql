-- =====================================================================
-- aura_user_active_room(p_user uuid)
-- Retorna a sala em que o usuário está ativo agora (last_ping <= 3 min).
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_user_active_room(p_user uuid)
RETURNS TABLE (
  slug      text,
  name      text,
  emoji     text,
  theme     text,
  last_ping timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.slug, r.name, r.emoji, r.theme, pr.last_ping
    FROM public.oculto_aura_room_presence pr
    JOIN public.oculto_aura_rooms r ON r.slug = pr.room_slug
   WHERE pr.user_id = p_user
     AND pr.last_ping > now() - interval '3 minutes'
     AND r.active = true
   ORDER BY pr.last_ping DESC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.aura_user_active_room(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
