-- 1. Habilitar Realtime para site_sections
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_sections;

-- 2. Criar tabela de add-ons da plataforma
CREATE TABLE public.platform_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  icon TEXT DEFAULT 'Sparkles',
  is_active BOOLEAN DEFAULT true,
  compatible_plans TEXT[] DEFAULT ARRAY['premium', 'vip'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Migrar Ghost Mode para add-ons
INSERT INTO public.platform_addons (name, slug, description, price_monthly, icon, compatible_plans)
VALUES ('Modo Fantasma', 'ghost-mode', 'Navegue sem deixar rastros na lista "Quem visitou"', 9.99, 'Ghost', ARRAY['premium', 'vip']);

-- 4. RLS para add-ons
ALTER TABLE public.platform_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_addons_public_read" 
ON public.platform_addons 
FOR SELECT 
USING (true);

CREATE POLICY "platform_addons_admin_all" 
ON public.platform_addons 
FOR ALL 
USING (is_admin(auth.uid()));

-- 5. Habilitar Realtime para add-ons
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_addons;