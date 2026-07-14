-- 1. Criar tabela ab_test_configs para eliminar erros 404
CREATE TABLE IF NOT EXISTS public.ab_test_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  variants JSONB DEFAULT '[]'::jsonb,
  traffic_percentage NUMERIC DEFAULT 100,
  metric_key TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ab_test_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ab_test_configs"
  ON public.ab_test_configs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage ab_test_configs"
  ON public.ab_test_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Ativar Realtime na tabela profiles para saldo instantâneo
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;