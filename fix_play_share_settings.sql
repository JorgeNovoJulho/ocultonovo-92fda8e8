-- Criar a tabela se não existir
CREATE TABLE IF NOT EXISTS public.oculto_play_share_settings (
    id bigint PRIMARY KEY DEFAULT 1,
    show_logo boolean DEFAULT true,
    show_author_card boolean DEFAULT true,
    show_player boolean DEFAULT true,
    show_stats boolean DEFAULT true,
    show_signup_cta boolean DEFAULT true,
    cta_title text DEFAULT 'OCULTO é uma rede social adulta +18',
    cta_text text DEFAULT 'Crie sua conta gratuita para curtir, comentar, salvar em coleções, mandar mensagens e explorar todo o universo do OCULTO PLAY.',
    cta_button_text text DEFAULT 'Criar minha conta grátis',
    bg_color text DEFAULT '#0a0a0a',
    accent_color text DEFAULT '#ec4899',
    footer_text text DEFAULT '© OCULTO PLAY - Todos os direitos reservados',
    updated_at timestamp with time zone DEFAULT now()
);

-- Adicionar coluna cta_title se não existir (caso a tabela já exista mas sem essa coluna)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oculto_play_share_settings' AND column_name='cta_title') THEN
        ALTER TABLE public.oculto_play_share_settings ADD COLUMN cta_title text DEFAULT 'OCULTO é uma rede social adulta +18';
    END IF;
END $$;

-- Configurar RLS
ALTER TABLE public.oculto_play_share_settings ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT ON public.oculto_play_share_settings TO anon;
GRANT SELECT ON public.oculto_play_share_settings TO authenticated;
GRANT ALL ON public.oculto_play_share_settings TO service_role;

-- Políticas
DROP POLICY IF EXISTS "Permitir leitura pública" ON public.oculto_play_share_settings;
CREATE POLICY "Permitir leitura pública" ON public.oculto_play_share_settings
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins gerenciam settings" ON public.oculto_play_share_settings;
CREATE POLICY "Admins gerenciam settings" ON public.oculto_play_share_settings
FOR ALL TO authenticated
USING (public.is_admin_master());

-- Inserir linha inicial se não houver
INSERT INTO public.oculto_play_share_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
