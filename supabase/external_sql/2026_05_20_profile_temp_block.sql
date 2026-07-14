-- =========================================================================
-- 2026-05-20 — Bloqueio temporário de perfil (admin master)
--
-- Adiciona `temp_blocked` / `temp_blocked_at` em public.profiles,
-- expõe RPC admin_set_profile_temp_block(uuid, boolean) para o admin
-- master ligar/desligar o bloqueio, e atualiza admin_list_welcome_logs
-- para também retornar o estado de bloqueio.
--
-- Idempotente — pode ser reexecutado.
-- =========================================================================

-- 1) Colunas
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS temp_blocked    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temp_blocked_at timestamptz NULL;

-- 2) RPC para bloquear/desbloquear
CREATE OR REPLACE FUNCTION public.admin_set_profile_temp_block(
  p_user_id uuid,
  p_blocked boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  IF NOT public._is_master_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  UPDATE public.profiles
     SET temp_blocked    = COALESCE(p_blocked, false),
         temp_blocked_at = CASE WHEN COALESCE(p_blocked, false) THEN now() ELSE NULL END
   WHERE user_id = p_user_id
      OR id      = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_temp_block(uuid, boolean)
  TO authenticated, service_role;

-- 3) Atualiza admin_list_welcome_logs para retornar `temp_blocked`
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
   ORDER BY p.created_at DESC NULLS LAST, l.sent_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit,100), 500))
   OFFSET GREATEST(0, COALESCE(p_offset,0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_welcome_logs(text, text, int, int)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
