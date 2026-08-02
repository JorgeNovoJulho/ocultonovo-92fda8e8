-- 1) Garantia: Apenas ocultomaster@ocultoswing.com.br tem a role admin_master
DELETE FROM public.user_roles WHERE role = 'admin_master';

-- 2) Vincular o usuário correto
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin_master'
FROM auth.users
WHERE email = 'ocultomaster@ocultoswing.com.br'
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) Ajustar a função RPC restore_account para usar ID do usuário logado e não travar
-- (Caso ela esteja checando email fixo internamente)
CREATE OR REPLACE FUNCTION public.restore_account(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verifica se quem está chamando é master
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador master pode restaurar contas excluídas';
  END IF;

  -- Remove do cemitério/restaura logicamente
  UPDATE public.profiles 
  SET 
    deleted_at = NULL, 
    deleted_reason = NULL,
    status = 'active'
  WHERE user_id = p_user_id;
  
  -- Se houver logica de auth.users, aqui seria o local (ex: habilitar login se estiver disabled)
END;
$function$;

-- 4) Recarregar esquema
NOTIFY pgrst, 'reload schema';

-- 5) Verificação
SELECT 
    u.email, 
    r.role AS assigned_role
FROM auth.users u 
JOIN public.user_roles r ON u.id = r.user_id 
WHERE r.role = 'admin_master';
