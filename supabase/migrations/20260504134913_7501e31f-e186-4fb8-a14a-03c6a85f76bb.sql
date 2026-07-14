
-- ─── Tabela de planos da plataforma (Free, Premium, VIP) ───────────────────
CREATE TABLE IF NOT EXISTS public.oculto_platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan_type text NOT NULL CHECK (plan_type IN ('free','premium','vip')),
  description text,
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  price_annual_per_month numeric(10,2) NOT NULL DEFAULT 0,
  price_annual_total numeric(10,2) NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  restrictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_popular boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  cta_text text,
  stripe_product_id text,
  stripe_price_id_monthly text,
  stripe_price_id_annual text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_platform_plans ENABLE ROW LEVEL SECURITY;

-- Leitura pública dos planos ativos (necessário para landing sem auth)
CREATE POLICY "Anyone can view active platform plans"
  ON public.oculto_platform_plans FOR SELECT
  USING (is_active = true);

-- Admins podem ver todos (inclusive desativados)
CREATE POLICY "Admins can view all platform plans"
  ON public.oculto_platform_plans FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Apenas admins podem criar
CREATE POLICY "Admins can insert platform plans"
  ON public.oculto_platform_plans FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Apenas admins podem atualizar
CREATE POLICY "Admins can update platform plans"
  ON public.oculto_platform_plans FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Apenas admins podem deletar
CREATE POLICY "Admins can delete platform plans"
  ON public.oculto_platform_plans FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE TRIGGER update_oculto_platform_plans_updated_at
  BEFORE UPDATE ON public.oculto_platform_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_platform_plans;
ALTER TABLE public.oculto_platform_plans REPLICA IDENTITY FULL;

-- Seed dos 3 planos atuais
INSERT INTO public.oculto_platform_plans
  (name, slug, plan_type, description, price_monthly, price_annual_per_month, price_annual_total, features, restrictions, is_active, is_popular, is_default, display_order, cta_text)
VALUES
  (
    'Free',
    'free',
    'free',
    'Acesso básico à plataforma',
    0, 0, 0,
    '["Acesso ao feed público","Enviar somente imagens no chat","Perfil básico","Explorar criadores"]'::jsonb,
    '["Não pode responder usuários Premium ou VIP","Não pode enviar áudios no chat","Não pode enviar vídeos no chat","Câmera bloqueada no chat"]'::jsonb,
    true, false, true, 1, 'Começar Grátis'
  ),
  (
    'Premium',
    'premium',
    'premium',
    'Experiência completa para usuários',
    25.90, 19.90, 238.80,
    '["Tudo do plano Free","Mensagens ilimitadas","Responder qualquer usuário no chat","Enviar áudios no chat","Enviar vídeos no chat","Câmera liberada no chat","Ver quem visitou seu perfil","Radar de localização","Sem anúncios","Badge Premium verificado","Prioridade no Radar"]'::jsonb,
    '[]'::jsonb,
    true, true, false, 2, 'Assinar Premium'
  ),
  (
    'VIP',
    'vip',
    'vip',
    'Acesso total + ferramentas de criador',
    145.90, 125.90, 1510.80,
    '["Tudo do plano Premium","Chat completo: áudio, vídeo e câmera","Responder qualquer usuário no chat","Criar conteúdo exclusivo pago","Assinaturas de canal","Mensagens pagas (Super DM)","Leilões de conteúdo","Dashboard de ganhos","Saque via PIX","Badge VIP dourado animado","Prioridade máxima na busca"]'::jsonb,
    '[]'::jsonb,
    true, false, false, 3, 'Assinar VIP'
  )
ON CONFLICT (slug) DO NOTHING;
