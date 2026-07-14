-- =============================================
-- FASE 5.10: SISTEMA DE FATURAS/INVOICES COMPLETO
-- =============================================

-- Melhorar tabela de faturas geradas
ALTER TABLE public.generated_invoices 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'generated',
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sent_to_email TEXT,
ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_downloaded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_generated_invoices_transaction ON public.generated_invoices(transaction_id);
CREATE INDEX IF NOT EXISTS idx_generated_invoices_generated_by ON public.generated_invoices(generated_by);
CREATE INDEX IF NOT EXISTS idx_generated_invoices_created_at ON public.generated_invoices(created_at DESC);

-- Tabela para configurações de faturas
CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name TEXT,
  company_address TEXT,
  company_document TEXT,
  logo_url TEXT,
  footer_text TEXT,
  include_logo BOOLEAN DEFAULT true,
  include_qr_code BOOLEAN DEFAULT false,
  auto_send_email BOOLEAN DEFAULT false,
  custom_css TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(creator_id)
);

-- Tabela para templates de faturas
CREATE TABLE IF NOT EXISTS public.invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  html_template TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para log de envios de faturas
CREATE TABLE IF NOT EXISTS public.invoice_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.generated_invoices(id) ON DELETE CASCADE,
  sent_to TEXT NOT NULL,
  send_method TEXT DEFAULT 'email',
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_send_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies para invoice_settings
CREATE POLICY "Users can view own invoice settings"
  ON public.invoice_settings FOR SELECT
  USING (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own invoice settings"
  ON public.invoice_settings FOR ALL
  USING (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- RLS Policies para invoice_templates
CREATE POLICY "Anyone can view active templates"
  ON public.invoice_templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage templates"
  ON public.invoice_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'admin_master')
    )
  );

-- RLS Policies para invoice_send_logs
CREATE POLICY "Users can view own invoice logs"
  ON public.invoice_send_logs FOR SELECT
  USING (
    invoice_id IN (
      SELECT id FROM generated_invoices 
      WHERE generated_by = auth.uid()
    )
  );

CREATE POLICY "Admins can view all invoice logs"
  ON public.invoice_send_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'admin_master')
    )
  );

-- Função para incrementar downloads
CREATE OR REPLACE FUNCTION public.increment_invoice_download(invoice_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE generated_invoices
  SET 
    download_count = COALESCE(download_count, 0) + 1,
    last_downloaded_at = now()
  WHERE id = invoice_id;
END;
$$;

-- Função para buscar estatísticas de faturas
CREATE OR REPLACE FUNCTION public.get_invoice_stats()
RETURNS TABLE (
  total_invoices BIGINT,
  invoices_today BIGINT,
  invoices_this_month BIGINT,
  total_downloads BIGINT,
  emails_sent BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_invoices,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT as invoices_today,
    COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::BIGINT as invoices_this_month,
    COALESCE(SUM(download_count), 0)::BIGINT as total_downloads,
    COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::BIGINT as emails_sent
  FROM generated_invoices;
END;
$$;

-- Template padrão
INSERT INTO public.invoice_templates (name, description, html_template, is_default, is_active)
VALUES (
  'Template Padrão',
  'Template elegante com gradiente roxo/rosa',
  'default',
  true,
  true
) ON CONFLICT DO NOTHING;