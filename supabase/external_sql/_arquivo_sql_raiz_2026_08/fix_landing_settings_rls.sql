-- Correção definitiva para permissões da tabela landing_settings e is_admin_master
-- Este script garante que o usuário ocultomaster@ocultoswing.com.br tenha acesso total e que a função is_admin_master funcione sem parâmetros (como usada nas RLS)

-- 1. Garantir que o usuário master tenha a role correta
DO $$
DECLARE
    v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'ocultomaster@ocultoswing.com.br';
    
    IF v_user_id IS NOT NULL THEN
        -- Remove roles antigas para evitar conflitos
        DELETE FROM public.user_roles WHERE user_id = v_user_id;
        
        -- Insere a role admin_master
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'admin_master');
        
        RAISE NOTICE 'Role admin_master atribuída a ocultomaster@ocultoswing.com.br (ID: %)', v_user_id;
    ELSE
        RAISE NOTICE 'Usuário ocultomaster@ocultoswing.com.br não encontrado em auth.users';
    END IF;
END $$;

-- 2. Recriar a função is_admin_master sem parâmetros para uso em RLS (DEFAULT auth.uid())
CREATE OR REPLACE FUNCTION public.is_admin_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin_master'
  );
$$;

-- 3. Garantir que as tabelas tenham permissão de acesso via API (Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_settings TO authenticated;
GRANT ALL ON public.landing_settings TO service_role;
GRANT SELECT ON public.landing_settings TO anon;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 4. Resetar e aplicar RLS corretas na landing_settings
ALTER TABLE public.landing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can select landing settings" ON public.landing_settings;
CREATE POLICY "Public can select landing settings"
  ON public.landing_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Master admin can manage landing settings" ON public.landing_settings;
CREATE POLICY "Master admin can manage landing settings"
  ON public.landing_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin_master())
  WITH CHECK (public.is_admin_master());

-- 5. Garantir que a tabela tenha a chave de configuração inicial caso não exista
INSERT INTO public.landing_settings (setting_key, setting_value)
VALUES ('invite_modal', '{}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
