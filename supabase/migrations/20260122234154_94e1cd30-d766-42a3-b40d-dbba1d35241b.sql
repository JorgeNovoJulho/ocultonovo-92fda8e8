-- Tabela de Denúncias de Conteúdo com priorização jurídica
CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  reported_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_id uuid NOT NULL,
  
  -- Categoria e Prioridade
  category text NOT NULL CHECK (category IN ('revenge_porn', 'minor', 'spam', 'harassment', 'fake_profile', 'other')),
  priority_level text NOT NULL DEFAULT 'normal' CHECK (priority_level IN ('critical', 'high', 'normal', 'low')),
  
  -- Detalhes da denúncia
  description text,
  evidence_urls text[], -- URLs de capturas de tela no Storage
  
  -- Status e SLA
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'action_taken', 'dismissed', 'escalated')),
  sla_deadline timestamp with time zone, -- Prazo para resolução
  
  -- Ação tomada
  content_hidden boolean DEFAULT false, -- Se o conteúdo foi ocultado cautelarmente
  hidden_at timestamp with time zone,
  hidden_by uuid,
  
  -- Resolução
  resolution_notes text,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON public.content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_priority ON public.content_reports(priority_level);
CREATE INDEX IF NOT EXISTS idx_content_reports_post ON public.content_reports(post_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_sla ON public.content_reports(sla_deadline) WHERE status = 'pending';

-- Habilitar RLS
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can create reports"
  ON public.content_reports
  FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Users can view their own reports"
  ON public.content_reports
  FOR SELECT
  USING (reporter_id = auth.uid());

CREATE POLICY "Admins can view all reports"
  ON public.content_reports
  FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update reports"
  ON public.content_reports
  FOR UPDATE
  USING (is_admin(auth.uid()));

-- Função para calcular SLA baseado na prioridade
CREATE OR REPLACE FUNCTION public.calculate_report_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Definir SLA baseado na categoria/prioridade
  IF NEW.category IN ('revenge_porn', 'minor') THEN
    NEW.priority_level := 'critical';
    NEW.sla_deadline := now() + INTERVAL '2 hours';
  ELSIF NEW.category = 'harassment' THEN
    NEW.priority_level := 'high';
    NEW.sla_deadline := now() + INTERVAL '12 hours';
  ELSE
    NEW.priority_level := 'normal';
    NEW.sla_deadline := now() + INTERVAL '48 hours';
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Trigger para calcular SLA automaticamente
DROP TRIGGER IF EXISTS set_report_sla ON public.content_reports;
CREATE TRIGGER set_report_sla
  BEFORE INSERT ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_report_sla();

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_content_reports_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_content_reports_timestamp ON public.content_reports;
CREATE TRIGGER update_content_reports_timestamp
  BEFORE UPDATE ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_content_reports_timestamp();

-- Adicionar coluna is_hidden aos posts para ocultação cautelar
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_reason text,
ADD COLUMN IF NOT EXISTS hidden_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS hidden_by uuid;

-- Bucket para evidências de denúncias (privado)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('report-evidence', 'report-evidence', false, 10485760) -- 10MB limit
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para evidências
CREATE POLICY "Users can upload evidence for their reports"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'report-evidence' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Admins can view all evidence"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'report-evidence' 
  AND is_admin(auth.uid())
);

CREATE POLICY "Users can view their own uploaded evidence"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'report-evidence' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);