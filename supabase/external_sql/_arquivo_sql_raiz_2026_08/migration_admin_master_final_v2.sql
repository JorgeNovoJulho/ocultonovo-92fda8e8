-- 1) Limpar roles master antigas e garantir apenas o e-mail correto
DELETE FROM public.user_roles WHERE role = 'admin_master';

-- 2) Vincular o novo e-mail oficial à role admin_master
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin_master'
FROM auth.users
WHERE email = 'ocultomaster@ocultoswing.com.br'
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) Dropar e recriar a função restore_account para evitar erro de mudança de tipo de retorno
DROP FUNCTION IF EXISTS public.restore_account(uuid);

CREATE OR REPLACE FUNCTION public.restore_account(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verifica se o executor é um admin_master
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador master pode restaurar contas excluídas';
  END IF;

  UPDATE public.profiles 
  SET 
    deleted_at = NULL, 
    deleted_reason = NULL,
    status = 'active'
  WHERE user_id = p_user_id;
END;
$function$;

-- 4) Sincronizar cache
NOTIFY pgrst, 'reload schema';

-- 5) Verificação (deve retornar 1 linha com ocultomaster@ocultoswing.com.br)
SELECT u.email, r.role AS assigned_role FROM auth.users u 
JOIN public.user_roles r ON u.id = r.user_id 
WHERE r.role = 'admin_master';
