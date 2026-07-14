-- Tabela para armazenar checklists de QA por plano
CREATE TABLE public.qa_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type text NOT NULL CHECK (plan_type IN ('visitor', 'free', 'premium', 'vip')),
  checklist_data jsonb DEFAULT '{}',
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(admin_id, plan_type)
);

-- Habilitar RLS
ALTER TABLE public.qa_checklists ENABLE ROW LEVEL SECURITY;

-- Policy: Apenas admins podem gerenciar checklists
CREATE POLICY "Admins can manage QA checklists" ON public.qa_checklists
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin_master') OR 
    public.has_role(auth.uid(), 'admin_regional') OR
    public.has_role(auth.uid(), 'moderator')
  );

-- Tabela para armazenar sessões de impersonificação ativas
CREATE TABLE public.admin_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_name text,
  target_user_plan text,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT now() + interval '2 hours',
  is_active boolean DEFAULT true
);

-- RLS para sessões de impersonificação
ALTER TABLE public.admin_impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Apenas o admin pode ver suas próprias sessões
CREATE POLICY "Admin can manage own impersonation sessions" ON public.admin_impersonation_sessions
  FOR ALL USING (admin_user_id = auth.uid());

-- Índice para busca rápida de sessões ativas
CREATE INDEX idx_impersonation_sessions_active ON public.admin_impersonation_sessions(admin_user_id, is_active) WHERE is_active = true;