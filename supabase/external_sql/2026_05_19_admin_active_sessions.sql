-- ============================================================
-- ADMIN — Sessões ativas (visualizar / revogar)
-- Requer tabela e RPCs criadas em 2026_05_19_single_session_enforcement.sql
-- ============================================================

-- Helper: verifica se o caller é o admin master
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = auth.uid()
      AND lower(coalesce(u.email, '')) = 'ocultomaster@ocultoswing.com.br'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;

-- Listagem (apenas master)
CREATE OR REPLACE FUNCTION public.admin_list_active_sessions(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 100
)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  email text,
  current_session_id text,
  device_label text,
  user_agent text,
  updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'forbidden: master admin only';
  END IF;

  RETURN QUERY
  SELECT
    s.user_id,
    p.username,
    p.display_name,
    u.email::text,
    s.current_session_id,
    s.device_label,
    s.user_agent,
    s.updated_at,
    s.created_at
  FROM public.oculto_active_sessions s
  LEFT JOIN public.profiles p ON p.id = s.user_id OR p.user_id = s.user_id
  LEFT JOIN auth.users u       ON u.id = s.user_id
  WHERE p_search IS NULL
     OR p_search = ''
     OR p.username     ILIKE '%' || p_search || '%'
     OR p.display_name ILIKE '%' || p_search || '%'
     OR u.email        ILIKE '%' || p_search || '%'
  ORDER BY s.updated_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_active_sessions(text, int) TO authenticated;

-- Revogação (apenas master) — sobrescreve a sessão com um sentinel,
-- o que dispara o realtime e força o logout no dispositivo do usuário.
CREATE OR REPLACE FUNCTION public.admin_revoke_active_session(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'forbidden: master admin only';
  END IF;

  UPDATE public.oculto_active_sessions
     SET current_session_id = 'REVOKED_BY_ADMIN_' || extract(epoch FROM now())::bigint::text,
         device_label       = coalesce(device_label, '') || ' (revoked)',
         updated_at         = now()
   WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_active_session(uuid) TO authenticated;
