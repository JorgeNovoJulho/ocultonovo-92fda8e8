-- Criar tabela para equipe administrativa
CREATE TABLE IF NOT EXISTS public.admin_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin_master', 'admin_regional', 'moderator')),
  permissions JSONB DEFAULT '{"financialAccess": false, "contentModeration": true, "supportAccess": true, "systemSettings": false}',
  region TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.admin_staff ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para admin_staff
CREATE POLICY "Master admins can manage staff"
  ON public.admin_staff FOR ALL
  USING (has_role(auth.uid(), 'admin_master'));

CREATE POLICY "Admins can view staff"
  ON public.admin_staff FOR SELECT
  USING (is_admin(auth.uid()));

-- Habilitar realtime para admin_staff
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_staff;