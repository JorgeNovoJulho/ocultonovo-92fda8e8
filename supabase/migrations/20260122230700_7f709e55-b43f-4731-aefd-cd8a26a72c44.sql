-- 1. Adicionar coluna de última atividade para anonimização LGPD
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 2. Adicionar coluna is_anonymized para controle
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_anonymized BOOLEAN DEFAULT false;

-- 3. Criar tabela para consentimento de cookies (LGPD)
CREATE TABLE IF NOT EXISTS public.cookie_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  essential BOOLEAN DEFAULT true NOT NULL,
  analytics BOOLEAN DEFAULT false NOT NULL,
  personalization BOOLEAN DEFAULT false NOT NULL,
  marketing BOOLEAN DEFAULT false NOT NULL,
  consented_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_user_consent UNIQUE (user_id),
  CONSTRAINT unique_session_consent UNIQUE (session_id)
);

-- 4. Adicionar configuração RESEND_API_KEY na tabela system_settings (JSON format)
INSERT INTO public.system_settings (key, value, description)
VALUES ('resend_api_key', '"re_placeholder_configure_in_admin"'::jsonb, 'Chave de API do Resend para envio de emails LGPD')
ON CONFLICT (key) DO NOTHING;

-- 5. Enable RLS para cookie_consents
ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

-- 6. Políticas RLS para cookie_consents
CREATE POLICY "Users can view their own cookie consent"
ON public.cookie_consents FOR SELECT
USING (auth.uid() = user_id OR session_id IS NOT NULL);

CREATE POLICY "Users can insert their own cookie consent"
ON public.cookie_consents FOR INSERT
WITH CHECK (auth.uid() = user_id OR (user_id IS NULL AND session_id IS NOT NULL));

CREATE POLICY "Users can update their own cookie consent"
ON public.cookie_consents FOR UPDATE
USING (auth.uid() = user_id OR session_id IS NOT NULL);

-- 7. Trigger para atualizar updated_at em cookie_consents
CREATE OR REPLACE FUNCTION public.update_cookie_consent_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_cookie_consents_updated_at
BEFORE UPDATE ON public.cookie_consents
FOR EACH ROW
EXECUTE FUNCTION public.update_cookie_consent_timestamp();

-- 8. Função para atualizar last_activity_at automaticamente
CREATE OR REPLACE FUNCTION public.update_user_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles 
  SET last_activity_at = now() 
  WHERE user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Criar índice para busca de usuários inativos
CREATE INDEX IF NOT EXISTS idx_profiles_last_activity ON public.profiles(last_activity_at);