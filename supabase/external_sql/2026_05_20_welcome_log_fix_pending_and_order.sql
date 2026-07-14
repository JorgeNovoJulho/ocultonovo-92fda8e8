-- =========================================================================
-- 2026-05-20 — Welcome Log: corrige pendentes (exclui remetente master) e
-- reordena as entregas por data de envio (mais recente primeiro).
--
-- Idempotente.
-- =========================================================================

-- 1) Pendentes — excluir o próprio remetente master e contas-admin sem perfil real
CREATE OR REPLACE FUNCTION public.admin_list_welcome_pending(p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id uuid, username text, name text, avatar_url text, profile_created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender_id uuid;
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT u.id INTO v_sender_id
    FROM auth.users u
    JOIN public.oculto_welcome_message_settings s ON s.id = 1
   WHERE lower(u.email) = lower(s.sender_email)
   LIMIT 1;

  RETURN QUERY
  SELECT p.user_id, p.username, p.name, p.avatar_url, p.created_at
    FROM public.profiles p
    LEFT JOIN public.oculto_welcome_message_log l ON l.user_id = p.user_id
   WHERE p.user_id IS NOT NULL
     AND COALESCE(p.is_seed, false) = false
     AND l.user_id IS NULL
     AND (v_sender_id IS NULL OR p.user_id <> v_sender_id)
   ORDER BY p.created_at DESC NULLS LAST
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_welcome_pending(int) TO authenticated;

-- 2) Lista de entregas — ordenar por sent_at DESC (mais recente primeiro)
DROP FUNCTION IF EXISTS public.admin_list_welcome_logs(text, text, int, int);

CREATE OR REPLACE FUNCTION public.admin_list_welcome_logs(
  p_search text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limit  int  DEFAULT 100,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  is_seed boolean,
  profile_created_at timestamptz,
  source text,
  sent_at timestamptz,
  conversation_id uuid,
  message_id uuid,
  temp_blocked boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT l.user_id, p.username, p.name, p.avatar_url, p.is_seed,
         p.created_at, l.source, l.sent_at, l.conversation_id, l.message_id,
         COALESCE(p.temp_blocked, false)
    FROM public.oculto_welcome_message_log l
    LEFT JOIN public.profiles p ON p.user_id = l.user_id
   WHERE (p_source IS NULL OR p_source = '' OR l.source = p_source)
     AND (p_search IS NULL OR p_search = '' OR
          p.username ILIKE '%'||p_search||'%' OR p.name ILIKE '%'||p_search||'%')
   ORDER BY l.sent_at DESC NULLS LAST, p.created_at DESC NULLS LAST
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
   OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_welcome_logs(text, text, int, int)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
