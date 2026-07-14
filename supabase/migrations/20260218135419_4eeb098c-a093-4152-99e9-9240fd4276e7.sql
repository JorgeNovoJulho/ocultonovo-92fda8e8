
-- Criar tabela de logs de notificações/alertas disparados
CREATE TABLE IF NOT EXISTS public.notification_dispatch_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'email', 'push', 'webhook', 'sms', 'discord', 'slack')),
  recipient TEXT NULL,
  message_preview TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
  error_message TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_created_at ON public.notification_dispatch_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_channel ON public.notification_dispatch_logs (channel);
CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_status ON public.notification_dispatch_logs (status);

-- Enable RLS
ALTER TABLE public.notification_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver os logs (sem user_id já que são logs de sistema)
CREATE POLICY "Admins can view notification logs" ON public.notification_dispatch_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master', 'moderator')
    )
  );

-- Sistema pode inserir logs (via service role ou RLS bypass)
CREATE POLICY "System can insert notification logs" ON public.notification_dispatch_logs
  FOR INSERT WITH CHECK (true);
