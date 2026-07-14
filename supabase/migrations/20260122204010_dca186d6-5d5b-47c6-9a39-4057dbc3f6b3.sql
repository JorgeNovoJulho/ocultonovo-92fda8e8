-- Add birth_date and gender fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('man', 'woman', 'couple', 'other')),
ADD COLUMN IF NOT EXISTS gender_other TEXT;

-- Drop existing check constraint on plan_type and add new one with premium
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_type_check;
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_plan_type_check CHECK (plan_type IN ('free', 'premium', 'vip'));

-- Create PIX gateway configuration table for admin
CREATE TABLE IF NOT EXISTS public.pix_gateway_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gateway_provider TEXT NOT NULL DEFAULT 'mercadopago',
  api_key_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  is_active BOOLEAN DEFAULT false,
  sandbox_mode BOOLEAN DEFAULT true,
  pix_key TEXT,
  pix_key_type TEXT CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  min_deposit NUMERIC DEFAULT 5,
  max_deposit NUMERIC DEFAULT 10000,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pix_gateway_config ENABLE ROW LEVEL SECURITY;

-- Only master admins can manage PIX config
CREATE POLICY "Master admins can manage PIX config"
  ON public.pix_gateway_config FOR ALL
  USING (has_role(auth.uid(), 'admin_master'));

-- Admins can view PIX config
CREATE POLICY "Admins can view PIX config"
  ON public.pix_gateway_config FOR SELECT
  USING (is_admin(auth.uid()));

-- Insert default config row
INSERT INTO public.pix_gateway_config (gateway_provider, sandbox_mode, is_active) 
VALUES ('mercadopago', true, false)
ON CONFLICT DO NOTHING;