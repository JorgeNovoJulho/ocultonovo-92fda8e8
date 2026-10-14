-- =========================================================================
-- 2026-08-02 — CORREÇÃO CONSOLIDADA: Resolução de Dependências e Unificação Admin Master
-- =========================================================================

-- 1) Remover funções antigas com CASCADE para tratar dependências de RLS
-- O PostgreSQL exige CASCADE quando a função é usada em políticas (Policies)
DROP FUNCTION IF EXISTS public.is_admin_master(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_master() CASCADE;

-- 2) Recriar as funções SEM ambiguidades (sem valores DEFAULT)
-- Versão com argumento explícito
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

-- Versão sem argumento (usa a sessão atual)
CREATE OR REPLACE FUNCTION public.is_admin_master()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin_master(auth.uid());
$function$;

-- 3) Restaurar permissões de execução
GRANT EXECUTE ON FUNCTION public.is_admin_master(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_master()     TO authenticated, service_role;

-- 4) Recriar as Políticas que foram removidas pelo CASCADE
-- Baseado no erro reportado:

-- Tabela admin_notifications
CREATE POLICY admin_notifications_insert_admin_only ON public.admin_notifications 
FOR INSERT TO authenticated WITH CHECK (public.is_admin_master(auth.uid()));

-- Tabela aura_xp_global_config
CREATE POLICY aura_xp_global_config_admin_update ON public.aura_xp_global_config 
FOR UPDATE TO authenticated USING (public.is_admin_master(auth.uid()));

-- Tabela aura_xp_interaction_config
CREATE POLICY aura_xp_interaction_config_admin_manage ON public.aura_xp_interaction_config 
FOR ALL TO authenticated USING (public.is_admin_master(auth.uid()));

-- Tabela system_settings
CREATE POLICY "Authenticated users can view non-sensitive settings" ON public.system_settings 
FOR SELECT TO authenticated USING (COALESCE(is_sensitive, false) = false OR public.is_admin_master(auth.uid()));

CREATE POLICY restore_read_non_sensitive_system_settings_auth ON public.system_settings 
FOR SELECT TO authenticated USING (public.is_admin_master(auth.uid()));

-- Tabela posts
CREATE POLICY restore_update_own_posts_auth ON public.posts 
FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.is_admin_master(auth.uid()));

CREATE POLICY restore_delete_own_posts_auth ON public.posts 
FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.is_admin_master(auth.uid()));

-- Tabela profiles
CREATE POLICY restore_update_own_profile_auth ON public.profiles 
FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin_master(auth.uid()));

-- Tabela user_roles
CREATE POLICY restore_select_own_roles_auth ON public.user_roles 
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_master(auth.uid()));

-- 5) Garantia de Unicidade: Apenas oculto_master@gmail.com deve ser admin_master
DELETE FROM public.user_roles 
WHERE role = 'admin_master' 
AND user_id NOT IN (
    SELECT id FROM auth.users WHERE email = 'oculto_master@gmail.com'
);

-- Garantir que o usuário master tenha a role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin_master'
FROM auth.users
WHERE email = 'oculto_master@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 6) Recarregar esquema do PostgREST
NOTIFY pgrst, 'reload schema';

-- VERIFICAÇÃO FINAL
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='is_admin_master';
