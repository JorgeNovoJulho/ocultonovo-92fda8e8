-- Create table for Resend email gateway configuration
CREATE TABLE public.resend_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_encrypted TEXT,
  from_email TEXT DEFAULT 'noreply@oculto.app',
  from_name TEXT DEFAULT 'Oculto',
  is_active BOOLEAN DEFAULT false,
  sandbox_mode BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.resend_config ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write
CREATE POLICY "Admins can manage resend config"
ON public.resend_config
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Insert default config row
INSERT INTO public.resend_config (from_email, from_name, is_active, sandbox_mode)
VALUES ('cobranca@oculto.app', 'Oculto Swing', false, true);

-- Add comment
COMMENT ON TABLE public.resend_config IS 'Configuration for Resend email gateway';