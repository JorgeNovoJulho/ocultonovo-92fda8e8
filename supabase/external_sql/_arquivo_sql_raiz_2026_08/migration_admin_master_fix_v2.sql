-- 1) Limpar roles de admin_master antigas
DELETE FROM public.user_roles WHERE role = 'admin_master';

-- 2) Vincular o novo e-mail oficial à role admin_master
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin_master'
FROM auth.users
WHERE email = 'ocultomaster@ocultoswing.com.br'
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) Recarregar o esquema do PostgREST
NOTIFY pgrst, 'reload schema';

-- 4) Verificação corrigida (resolvendo ambiguidade da coluna 'role')
SELECT 
    u.email, 
    r.role AS assigned_role
FROM auth.users u 
JOIN public.user_roles r ON u.id = r.user_id 
WHERE r.role = 'admin_master';
