DROP POLICY IF EXISTS "Admins can manage landing settings" ON public.landing_settings;
CREATE POLICY "Master admin can manage landing settings"
  ON public.landing_settings
  FOR ALL TO authenticated
  USING (public.is_admin_master())
  WITH CHECK (public.is_admin_master());

DROP POLICY IF EXISTS "Admins can manage resend config" ON public.resend_config;
CREATE POLICY "Master admin can manage resend config"
  ON public.resend_config
  FOR ALL TO authenticated
  USING (public.is_admin_master())
  WITH CHECK (public.is_admin_master());

DROP POLICY IF EXISTS "Admins can manage whatsapp config" ON public.whatsapp_config;
CREATE POLICY "Master admin can manage whatsapp config"
  ON public.whatsapp_config
  FOR ALL TO authenticated
  USING (public.is_admin_master())
  WITH CHECK (public.is_admin_master());

DROP POLICY IF EXISTS "Admin can manage own impersonation sessions" ON public.admin_impersonation_sessions;
CREATE POLICY "Master admin can manage impersonation sessions"
  ON public.admin_impersonation_sessions
  FOR ALL TO authenticated
  USING (public.is_admin_master() AND admin_user_id = auth.uid())
  WITH CHECK (public.is_admin_master() AND admin_user_id = auth.uid());