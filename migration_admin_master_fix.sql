-- =========================================================================
-- 2026-08-02 — FIX: is_admin_master ambíguo e Garantia de Admin Master Único
-- =========================================================================

-- 1) Garantir que as funções não tenham ambiguidades (removendo DEFAULTs)
CREATE OR REPLACE FUNCTION public.is_admin_master(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role = 'admin_master'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_master()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin_master(auth.uid());
$function$;

-- 2) Ajustar permissões
GRANT EXECUTE ON FUNCTION public.is_admin_master(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_master()     TO authenticated, service_role;

-- 3) Garantia de Unicidade: Apenas oculto_master@gmail.com deve ser admin_master
-- Primeiro, removemos qualquer admin_master que não seja o oficial
DELETE FROM public.user_roles 
WHERE role = 'admin_master' 
AND user_id NOT IN (
    SELECT id FROM auth.users WHERE email = 'oculto_master@gmail.com'
);

-- Garantimos que o oculto_master@gmail.com TENHA a role no banco
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin_master'
FROM auth.users
WHERE email = 'oculto_master@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 4) Reload schema para o PostgREST reconhecer as mudanças
NOTIFY pgrst, 'reload schema';

-- 5) Verificação (Copie e cole este SELECT após rodar o script acima)
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_arguments(p.oid) AS args_full
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='is_admin_master';
