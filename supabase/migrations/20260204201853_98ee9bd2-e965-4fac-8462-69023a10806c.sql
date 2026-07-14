-- =====================================================
-- FASE 5.14.2: ADMIN MARKETPLACE PAGE
-- Painel administrativo para gestão do marketplace
-- =====================================================

-- Tabela para categorias do marketplace
CREATE TABLE IF NOT EXISTS public.marketplace_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para configurações do marketplace
CREATE TABLE IF NOT EXISTS public.marketplace_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Tabela para featured items (destaques)
CREATE TABLE IF NOT EXISTS public.marketplace_featured (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Função para estatísticas do marketplace admin
CREATE OR REPLACE FUNCTION get_marketplace_admin_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_items', (SELECT COUNT(*) FROM marketplace_items WHERE status = 'active'),
    'total_sales', (SELECT COUNT(*) FROM marketplace_purchases WHERE status = 'completed'),
    'total_revenue', COALESCE((SELECT SUM(amount) FROM marketplace_purchases WHERE status = 'completed'), 0),
    'pending_items', (SELECT COUNT(*) FROM marketplace_items WHERE status = 'pending'),
    'total_creators', (SELECT COUNT(DISTINCT creator_id) FROM marketplace_items),
    'avg_item_price', COALESCE((SELECT AVG(price) FROM marketplace_items WHERE status = 'active'), 0),
    'items_this_month', (
      SELECT COUNT(*) 
      FROM marketplace_items 
      WHERE created_at >= date_trunc('month', now())
    ),
    'sales_this_month', (
      SELECT COUNT(*) 
      FROM marketplace_purchases 
      WHERE created_at >= date_trunc('month', now()) AND status = 'completed'
    ),
    'revenue_this_month', COALESCE((
      SELECT SUM(amount) 
      FROM marketplace_purchases 
      WHERE created_at >= date_trunc('month', now()) AND status = 'completed'
    ), 0),
    'top_categories', (
      SELECT json_agg(cat_stats)
      FROM (
        SELECT 
          mi.category,
          COUNT(*) as count,
          COALESCE(SUM(mi.sales_count), 0) as total_sales
        FROM marketplace_items mi
        WHERE mi.status = 'active'
        GROUP BY mi.category
        ORDER BY total_sales DESC
        LIMIT 5
      ) cat_stats
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Função para listar itens do marketplace com filtros (admin)
CREATE OR REPLACE FUNCTION get_marketplace_items_admin(
  p_status TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  price NUMERIC,
  category TEXT,
  item_type TEXT,
  status TEXT,
  media_url TEXT,
  preview_url TEXT,
  creator_id UUID,
  creator_name TEXT,
  creator_avatar TEXT,
  sales_count INTEGER,
  view_count INTEGER,
  created_at TIMESTAMPTZ,
  is_featured BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mi.id,
    mi.title,
    mi.description,
    mi.price,
    mi.category,
    mi.item_type,
    mi.status,
    mi.media_url,
    mi.preview_url,
    mi.creator_id,
    p.display_name as creator_name,
    p.avatar_url as creator_avatar,
    COALESCE(mi.sales_count, 0)::INTEGER as sales_count,
    COALESCE(mi.view_count, 0)::INTEGER as view_count,
    mi.created_at,
    EXISTS(
      SELECT 1 FROM marketplace_featured mf 
      WHERE mf.item_id = mi.id AND mf.is_active = true
    ) as is_featured
  FROM marketplace_items mi
  JOIN profiles p ON p.id = mi.creator_id
  WHERE 
    (p_status IS NULL OR mi.status = p_status)
    AND (p_category IS NULL OR mi.category = p_category)
    AND (p_search IS NULL OR mi.title ILIKE '%' || p_search || '%' OR mi.description ILIKE '%' || p_search || '%')
  ORDER BY mi.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- RLS para tabelas novas
ALTER TABLE public.marketplace_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_featured ENABLE ROW LEVEL SECURITY;

-- Policies para marketplace_categories (leitura pública, escrita admin)
CREATE POLICY "Anyone can view active categories"
  ON public.marketplace_categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage categories"
  ON public.marketplace_categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies para marketplace_settings
CREATE POLICY "Admins can manage marketplace settings"
  ON public.marketplace_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies para marketplace_featured
CREATE POLICY "Anyone can view active featured items"
  ON public.marketplace_featured FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage featured items"
  ON public.marketplace_featured FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Inserir categorias padrão
INSERT INTO public.marketplace_categories (name, slug, description, icon, color, sort_order) VALUES
  ('Fotos', 'photos', 'Fotos exclusivas e ensaios', 'image', '#FF007F', 1),
  ('Vídeos', 'videos', 'Vídeos exclusivos', 'video', '#7C3AED', 2),
  ('Bundles', 'bundles', 'Pacotes com múltiplos itens', 'package', '#F59E0B', 3),
  ('Pré-venda', 'presale', 'Conteúdo em pré-venda', 'clock', '#10B981', 4),
  ('Áudio', 'audio', 'Mensagens de áudio exclusivas', 'mic', '#3B82F6', 5)
ON CONFLICT (slug) DO NOTHING;

-- Inserir configurações padrão
INSERT INTO public.marketplace_settings (setting_key, setting_value, description) VALUES
  ('platform_fee', '{"percentage": 20}', 'Taxa da plataforma em vendas'),
  ('min_price', '{"amount": 5}', 'Preço mínimo para itens'),
  ('max_price', '{"amount": 5000}', 'Preço máximo para itens'),
  ('auto_approve', '{"enabled": false}', 'Aprovação automática de itens'),
  ('featured_slots', '{"count": 6}', 'Número de slots de destaque na home')
ON CONFLICT (setting_key) DO NOTHING;