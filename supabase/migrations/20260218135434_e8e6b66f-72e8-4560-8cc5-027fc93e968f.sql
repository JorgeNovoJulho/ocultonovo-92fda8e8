
-- Corrigir a policy de INSERT para ser mais restrita (apenas admins autenticados)
DROP POLICY IF EXISTS "System can insert notification logs" ON public.notification_dispatch_logs;

CREATE POLICY "Admins can insert notification logs" ON public.notification_dispatch_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master', 'moderator')
    )
  );
