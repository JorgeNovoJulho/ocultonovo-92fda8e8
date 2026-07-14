-- Tabela para armazenar seções editáveis do site
CREATE TABLE public.site_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT UNIQUE NOT NULL,
  section_name TEXT NOT NULL,
  section_type TEXT NOT NULL DEFAULT 'content',
  content JSONB NOT NULL DEFAULT '{}',
  is_visible BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Tabela para armazenar imagens do site
CREATE TABLE public.site_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_key TEXT UNIQUE NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  section_id UUID REFERENCES public.site_sections(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_images ENABLE ROW LEVEL SECURITY;

-- Leitura pública (landing page precisa ler)
CREATE POLICY "site_sections_public_read" ON public.site_sections
  FOR SELECT USING (true);

CREATE POLICY "site_images_public_read" ON public.site_images
  FOR SELECT USING (true);

-- Admins podem fazer tudo
CREATE POLICY "site_sections_admin_all" ON public.site_sections
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "site_images_admin_all" ON public.site_images
  FOR ALL USING (is_admin(auth.uid()));

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_site_section_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_site_sections_timestamp
  BEFORE UPDATE ON public.site_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_site_section_timestamp();

-- Inserir dados iniciais das seções (conteúdo atual da Landing)
INSERT INTO public.site_sections (section_key, section_name, section_type, content, display_order) VALUES
('hero', 'Hero Principal', 'hero', '{
  "badge": "Conteúdo + Conexões Reais",
  "title_line1": "OCULTO.",
  "title_line2": "Onde o desejo",
  "title_line3": "encontra a conexão.",
  "subtitle": "A primeira plataforma que une conteúdo exclusivo e encontros reais. Para criadores, casais e admiradores.",
  "cta_primary": "Explorar o Radar",
  "cta_primary_link": "/radar",
  "cta_secondary": "Espiar",
  "cta_secondary_link": "/spy",
  "trust_online": "1.2K+ online agora",
  "trust_anonymous": "100% anônimo",
  "trust_age": "+18 anos"
}', 1),
('features', 'Recursos', 'features', '{
  "title": "Uma plataforma, infinitas possibilidades",
  "subtitle": "Criamos o espaço perfeito para quem busca liberdade, privacidade e conexões autênticas.",
  "items": [
    {"icon": "Users", "title": "Liberdade", "description": "Seja você mesmo. Perfis para Solteiros e Casais, sem julgamentos."},
    {"icon": "DollarSign", "title": "Monetização", "description": "Venda seu conteúdo exclusivo e construa sua comunidade de fãs."},
    {"icon": "Radar", "title": "Conexão", "description": "Encontre pessoas e casais compatíveis no Radar, perto de você."},
    {"icon": "Lock", "title": "Privacidade", "description": "Controle total sobre quem vê seu conteúdo e informações."},
    {"icon": "Shield", "title": "Segurança", "description": "Verificação de perfis e moderação ativa 24/7."},
    {"icon": "Sparkles", "title": "Experiência", "description": "Interface premium e recursos exclusivos para assinantes."}
  ]
}', 2),
('plans', 'Planos e Preços', 'plans', '{
  "badge": "💎 Planos para todos os perfis",
  "title": "Escolha o plano ideal para você",
  "subtitle": "Comece gratuitamente e desbloqueie recursos premium quando quiser.",
  "plans": [
    {
      "name": "Gratuito",
      "icon": "Users",
      "price": "R$ 0",
      "period": "/sempre",
      "description": "Explore sem compromisso",
      "features": ["Explore perfis limitados", "Modo Espião (teaser)", "Chat limitado"],
      "cta": "Começar Grátis",
      "highlighted": false
    },
    {
      "name": "Premium",
      "icon": "Sparkles",
      "price": "R$ 19,90",
      "period": "/mês",
      "annual_price": "ou R$ 239/ano",
      "description": "Acesso total",
      "features": ["Feed completo ilimitado", "Mensagens sem limite", "Ver quem visitou seu perfil", "Prioridade no Radar"],
      "cta": "Assinar Agora",
      "highlighted": true,
      "badge": "MAIS POPULAR"
    },
    {
      "name": "VIP Criador",
      "icon": "Crown",
      "price": "R$ 29,90",
      "period": "/mês",
      "description": "Crie e venda conteúdo",
      "features": ["Tudo do Premium", "Venda conteúdo exclusivo", "Dashboard de ganhos", "Cupons personalizados"],
      "cta": "Seja um Criador",
      "highlighted": false
    }
  ]
}', 3),
('ghost_banner', 'Banner Modo Fantasma', 'banner', '{
  "emoji": "🕵️",
  "title": "Modo Fantasma",
  "description": "Navegue sem deixar rastros. Ninguém saberá que você visitou o perfil.",
  "price": "+R$ 9,99",
  "period": "/mês (add-on)",
  "bg_gradient": "from-[#FF007F]/20 via-purple-500/10 to-transparent"
}', 4),
('coupon_banner', 'Banner Cupom', 'banner', '{
  "emoji": "🎁",
  "title": "Cupom de Primeira Compra",
  "description": "Use o código e ganhe 10% de desconto!",
  "coupon_code": "BEMVINDO10",
  "discount": "10% OFF",
  "bg_gradient": "from-emerald-500/20 via-teal-500/10 to-transparent"
}', 5),
('creators', 'Seção Criadores', 'content', '{
  "badge": "💰 Ganhe dinheiro com seu conteúdo",
  "title": "Transforme sua criatividade em renda",
  "subtitle": "Crie conteúdo exclusivo, construa sua comunidade de fãs e receba pagamentos diretamente. Você mantém 80% de tudo que ganha.",
  "cta": "Começar como Criador",
  "cta_link": "/signup",
  "stats": [
    {"value": "10K+", "label": "Criadores ativos"},
    {"value": "R$ 2M+", "label": "Pagos aos criadores"},
    {"value": "80%", "label": "Você mantém"}
  ]
}', 6),
('couples', 'Seção Casais', 'content', '{
  "badge": "👫 Para casais liberais",
  "title": "Conexões reais para casais",
  "subtitle": "Encontre outros casais e pessoas com os mesmos interesses. Perfis verificados, eventos exclusivos e a maior comunidade liberal do Brasil.",
  "tags": ["Ménage", "Voyeur", "Soft Swing", "Full Swap", "Fetiche", "BDSM"]
}', 7),
('footer_cta', 'CTA Final', 'cta', '{
  "title": "Pronto para descobrir o que está oculto?",
  "cta": "Criar Conta Grátis",
  "cta_link": "/signup"
}', 8),
('footer', 'Rodapé', 'footer', '{
  "copyright": "© 2025 OCULTO. Todos os direitos reservados.",
  "age_restriction": "+18 apenas.",
  "links": [
    {"label": "Termos de Uso", "href": "/legal/terms"},
    {"label": "Privacidade", "href": "/legal/privacy"},
    {"label": "Cookies", "href": "/legal/cookies"}
  ]
}', 9);

-- Criar bucket para assets do site
INSERT INTO storage.buckets (id, name, public) 
VALUES ('site-assets', 'site-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policies para o bucket site-assets
CREATE POLICY "site_assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'site-assets');

CREATE POLICY "site_assets_admin_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'site-assets' AND is_admin(auth.uid()));

CREATE POLICY "site_assets_admin_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'site-assets' AND is_admin(auth.uid()));

CREATE POLICY "site_assets_admin_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'site-assets' AND is_admin(auth.uid()));