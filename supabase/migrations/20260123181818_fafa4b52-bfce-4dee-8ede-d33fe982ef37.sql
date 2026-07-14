-- Tabela para logs de acesso durante impersonificação
CREATE TABLE public.impersonation_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES admin_impersonation_sessions(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  route_accessed text NOT NULL,
  route_category text NOT NULL CHECK (route_category IN ('messages', 'financial', 'hidden_content', 'profile', 'other')),
  sensitivity_level text DEFAULT 'low' CHECK (sensitivity_level IN ('low', 'medium', 'high', 'critical')),
  details jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_access_logs_session ON impersonation_access_logs(session_id);
CREATE INDEX idx_access_logs_admin ON impersonation_access_logs(admin_id);
CREATE INDEX idx_access_logs_category ON impersonation_access_logs(route_category);
CREATE INDEX idx_access_logs_sensitivity ON impersonation_access_logs(sensitivity_level);
CREATE INDEX idx_access_logs_created ON impersonation_access_logs(created_at DESC);

-- RLS: Apenas admin_master pode visualizar, admins podem inserir seus próprios logs
ALTER TABLE impersonation_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can view all access logs"
ON impersonation_access_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin_master'));

CREATE POLICY "Admins can insert their own access logs"
ON impersonation_access_logs FOR INSERT
TO authenticated
WITH CHECK (admin_id = auth.uid() AND is_admin(auth.uid()));