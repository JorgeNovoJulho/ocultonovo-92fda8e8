-- =====================================================================
-- 2026_05_24 — Cemitério de Contas Excluídas (soft-delete + restauração)
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO e execute.
-- =====================================================================

-- 1) Colunas de soft-delete em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_is_deleted
  ON public.profiles (is_deleted)
  WHERE is_deleted = true;

-- 2) RPC: soft_delete_account — usado pela edge function delete-account
--    Marca o profile como excluído, torna invisível e BANE o auth.user
--    (banned_until = infinity) para impedir novos logins. Os dados ficam
--    intactos para o Cemitério.
CREATE OR REPLACE FUNCTION public.soft_delete_account(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id ausente');
  END IF;

  -- Marca profile como excluído + invisível
  UPDATE public.profiles
     SET is_deleted   = true,
         deleted_at   = COALESCE(deleted_at, now()),
         deleted_reason = COALESCE(p_reason, deleted_reason),
         deleted_by   = COALESCE(deleted_by, p_user_id),
         is_invisible = true
   WHERE user_id = p_user_id
   RETURNING id INTO v_profile_id;

  -- Bane o auth.user para impedir novos logins (dados permanecem)
  BEGIN
    UPDATE auth.users
       SET banned_until = 'infinity'::timestamptz,
           updated_at   = now()
     WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- segue mesmo se a coluna mudar de nome no futuro
    NULL;
  END;

  -- Revoga sessões ativas (se tabela existir)
  BEGIN
    DELETE FROM auth.sessions WHERE user_id = p_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'profile_id', v_profile_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_account(uuid, text) TO authenticated, service_role;

-- 3) RPC: restore_account — APENAS master admin pode restaurar
CREATE OR REPLACE FUNCTION public.restore_account(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean := false;
BEGIN
  -- Checa master admin via has_role
  BEGIN
    SELECT public.has_role(auth.uid(), 'admin_master'::app_role) INTO v_is_master;
  EXCEPTION WHEN OTHERS THEN
    v_is_master := false;
  END;

  IF NOT COALESCE(v_is_master, false) THEN
    RAISE EXCEPTION 'Apenas o administrador master pode restaurar contas excluídas';
  END IF;

  UPDATE public.profiles
     SET is_deleted   = false,
         deleted_at   = NULL,
         deleted_reason = NULL,
         is_invisible = false
   WHERE user_id = p_user_id;

  -- Reabilita auth.user
  BEGIN
    UPDATE auth.users
       SET banned_until = NULL,
           updated_at   = now()
     WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_account(uuid) TO authenticated, service_role;

-- 4) View do Cemitério (apenas master admin lê — checagem no client)
CREATE OR REPLACE VIEW public.vw_account_cemetery
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.username,
  p.name,
  p.email,
  p.avatar_url,
  p.plan_type,
  p.deleted_at,
  p.deleted_reason,
  p.created_at
FROM public.profiles p
WHERE p.is_deleted = true;

GRANT SELECT ON public.vw_account_cemetery TO authenticated;
