-- Fix: envio manual de boas-vindas + policies aceitam master admin por e-mail
CREATE OR REPLACE FUNCTION public.admin_send_welcome_to_username(p_username text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  IF NOT (
    public.is_master_admin()
    OR public.has_role(auth.uid(),'admin_master')
    OR public.has_role(auth.uid(),'admin_regional')
    OR public.has_role(auth.uid(),'moderator')
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_username IS NULL OR length(trim(p_username))=0 THEN RETURN NULL; END IF;

  SELECT user_id INTO v_uid FROM public.profiles
   WHERE lower(username)=lower(trim(p_username)) LIMIT 1;
  IF v_uid IS NULL THEN
    SELECT id INTO v_uid FROM public.profiles
     WHERE lower(username)=lower(trim(p_username)) LIMIT 1;
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuário não encontrado: %', p_username; END IF;

  RETURN public.send_welcome_message_to_user(v_uid);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_send_welcome_to_username(text) TO authenticated, service_role;

DROP POLICY IF EXISTS welcome_settings_write ON public.oculto_welcome_message_settings;
CREATE POLICY welcome_settings_write ON public.oculto_welcome_message_settings
  FOR ALL TO authenticated
  USING (public.is_master_admin() OR public.has_role(auth.uid(),'admin_master') OR public.has_role(auth.uid(),'admin_regional') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.is_master_admin() OR public.has_role(auth.uid(),'admin_master') OR public.has_role(auth.uid(),'admin_regional') OR public.has_role(auth.uid(),'moderator'));

DROP POLICY IF EXISTS welcome_metrics_read ON public.oculto_welcome_message_metrics;
CREATE POLICY welcome_metrics_read ON public.oculto_welcome_message_metrics
  FOR SELECT TO authenticated
  USING (public.is_master_admin() OR public.has_role(auth.uid(),'admin_master') OR public.has_role(auth.uid(),'admin_regional') OR public.has_role(auth.uid(),'moderator'));
