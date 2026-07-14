-- =====================================================================
-- 2026_05_06: oculto_platform_plans (Free / Premium / VIP)
-- Idempotente: cria tabela, RLS e popula os 3 planos canônicos.
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_platform_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  plan_type TEXT NOT NULL,                    -- 'free' | 'premium' | 'vip'
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_annual_per_month DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_annual_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  restrictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  cta_text TEXT,
  stripe_price_id_monthly TEXT,
  stripe_price_id_annual TEXT,
  stripe_product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_platform_plans ENABLE ROW LEVEL SECURITY;

-- Leitura pública (planos são informação pública da plataforma)
DROP POLICY IF EXISTS "platform_plans_select_all" ON public.oculto_platform_plans;
CREATE POLICY "platform_plans_select_all"
  ON public.oculto_platform_plans FOR SELECT
  USING (true);

-- Escrita: apenas admins (assume função has_role(uid, 'admin') existente)
DROP POLICY IF EXISTS "platform_plans_admin_write" ON public.oculto_platform_plans;
CREATE POLICY "platform_plans_admin_write"
  ON public.oculto_platform_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.set_platform_plans_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_plans_updated_at ON public.oculto_platform_plans;
CREATE TRIGGER trg_platform_plans_updated_at
  BEFORE UPDATE ON public.oculto_platform_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_platform_plans_updated_at();

-- =====================================================================
-- SEED dos 3 planos canônicos (UPSERT por slug)
-- =====================================================================

INSERT INTO public.oculto_platform_plans
  (slug, plan_type, name, description, cta_text,
   price_monthly, price_annual_per_month, price_annual_total,
   is_active, is_popular, is_default, display_order, features, restrictions)
VALUES
  (
    'free', 'free', 'Free',
    'Plano gratuito para começar. Acesso ao feed completo e funcionalidades básicas da plataforma.',
    'Começar grátis',
    0, 0, 0,
    true, false, true, 1,
    '["Feed completo"]'::jsonb,
    '["Mensagens ilimitadas","Enviar áudio no chat","Enviar vídeo no chat","Câmera nativa no chat","Responder usuários Premium/VIP","Criar eventos VIP","Criar leilões","Publicar conteúdo pago / PPV","Criar cupons de desconto","Metas de arrecadação","Mensagens em massa (broadcast)","Enviar Super DM","Receber Super DM","Programa Convide e Ganhe","Programa Madrinhas","Perfil privado","Ocultar status online","Ocultar idade","Ocultar localização","Anônimo em rankings","Ver quem visitou o perfil","Modo fantasma incluso (sem add-on)","Sem anúncios"]'::jsonb
  ),
  (
    'premium', 'premium', 'Premium',
    'Plano Premium: chat completo, eventos, leilões, Super DM, broadcasts, perfil privado e sem anúncios.',
    'Assinar Premium',
    25.90, 19.90, 238.80,
    true, true, false, 2,
    '["Feed completo","Mensagens ilimitadas","Enviar áudio no chat","Enviar vídeo no chat","Câmera nativa no chat","Responder usuários Premium/VIP","Criar eventos VIP","Criar leilões","Metas de arrecadação","Mensagens em massa (broadcast)","Enviar Super DM","Receber Super DM","Programa Convide e Ganhe","Programa Madrinhas","Perfil privado","Ocultar status online","Ver quem visitou o perfil","Sem anúncios"]'::jsonb,
    '["Publicar conteúdo pago / PPV","Criar cupons de desconto","Ocultar idade","Ocultar localização","Anônimo em rankings","Modo fantasma incluso (sem add-on)"]'::jsonb
  ),
  (
    'vip', 'vip', 'VIP',
    'Plano VIP: tudo do Premium + conteúdo pago/PPV, cupons, privacidade total (idade, localização, ranking) e Modo Fantasma incluso.',
    'Assinar VIP',
    145.90, 125.90, 1510.80,
    true, false, false, 3,
    '["Feed completo","Mensagens ilimitadas","Enviar áudio no chat","Enviar vídeo no chat","Câmera nativa no chat","Responder usuários Premium/VIP","Criar eventos VIP","Criar leilões","Publicar conteúdo pago / PPV","Criar cupons de desconto","Metas de arrecadação","Mensagens em massa (broadcast)","Enviar Super DM","Receber Super DM","Programa Convide e Ganhe","Programa Madrinhas","Perfil privado","Ocultar status online","Ocultar idade","Ocultar localização","Anônimo em rankings","Ver quem visitou o perfil","Modo fantasma incluso (sem add-on)","Sem anúncios"]'::jsonb,
    '[]'::jsonb
  )
ON CONFLICT (slug) DO UPDATE SET
  plan_type = EXCLUDED.plan_type,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  cta_text = EXCLUDED.cta_text,
  price_monthly = EXCLUDED.price_monthly,
  price_annual_per_month = EXCLUDED.price_annual_per_month,
  price_annual_total = EXCLUDED.price_annual_total,
  is_active = EXCLUDED.is_active,
  is_popular = EXCLUDED.is_popular,
  is_default = EXCLUDED.is_default,
  display_order = EXCLUDED.display_order,
  features = EXCLUDED.features,
  restrictions = EXCLUDED.restrictions,
  updated_at = now();

-- Pede ao PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
