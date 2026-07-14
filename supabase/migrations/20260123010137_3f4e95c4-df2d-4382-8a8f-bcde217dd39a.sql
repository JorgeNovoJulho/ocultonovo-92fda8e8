-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT UNIQUE NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('free', 'premium', 'vip')),
  price_monthly NUMERIC DEFAULT 0,
  price_annual_per_month NUMERIC DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb,
  restrictions JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  stripe_price_id_monthly TEXT,
  stripe_price_id_annual TEXT,
  stripe_product_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage plans" ON public.subscription_plans
  FOR ALL USING (is_admin(auth.uid()));

-- Insert the 3 default plans
INSERT INTO public.subscription_plans (name, description, slug, plan_type, price_monthly, price_annual_per_month, features, restrictions, is_default, display_order) VALUES
(
  'Gratuito',
  'Acesso básico à plataforma com conteúdo limitado',
  'free',
  'free',
  0,
  0,
  '["Ver perfis públicos", "Feed básico", "Enviar mensagens limitadas (10/dia)", "Ver até 5 fotos por perfil", "Acesso ao radar básico"]'::jsonb,
  '["Sem acesso a conteúdo exclusivo", "Sem ver stories premium", "Limite de 10 mensagens por dia", "Sem acesso ao radar completo", "Sem ver quem visitou seu perfil"]'::jsonb,
  true,
  1
),
(
  'Premium',
  'Acesso completo a todo conteúdo exclusivo da plataforma',
  'premium',
  'premium',
  25.90,
  19.90,
  '["Acesso a todo conteúdo exclusivo", "Ver todos os stories", "Mensagens ilimitadas", "Radar completo", "Ver quem visitou seu perfil", "Destaque no feed", "Sem anúncios", "Suporte prioritário"]'::jsonb,
  '[]'::jsonb,
  false,
  2
),
(
  'VIP Criador',
  'Plano especial para criadores de conteúdo com ferramentas avançadas de monetização',
  'vip-creator',
  'vip',
  29.90,
  23.90,
  '["Todos os benefícios Premium", "Ferramentas de monetização", "Estatísticas avançadas de engajamento", "Prioridade máxima no suporte", "Badge VIP exclusivo no perfil", "Promover conteúdo no feed", "Criar cupons de desconto", "Dashboard completo de ganhos", "Saques prioritários", "Destaque especial no radar"]'::jsonb,
  '[]'::jsonb,
  false,
  3
);

-- Create trigger for updated_at
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_timestamp();