-- =====================================================
-- CORREÇÃO DE SEGURANÇA: SYSTEM_SETTINGS
-- =====================================================

-- SYSTEM_SETTINGS: Apenas admins podem ver configurações sensíveis
DROP POLICY IF EXISTS "Anyone can view system settings" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_select_policy" ON public.system_settings;
DROP POLICY IF EXISTS "Authenticated users can view non-sensitive settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can view all system settings" ON public.system_settings;

-- Usuários autenticados podem ver configurações não-sensíveis
CREATE POLICY "Authenticated users can view non-sensitive settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (
    key NOT LIKE '%secret%' 
    AND key NOT LIKE '%api_key%' 
    AND key NOT LIKE '%token%'
    AND key NOT LIKE '%password%'
  );

-- Admins podem ver tudo
CREATE POLICY "Admins can view all system settings"
  ON public.system_settings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));