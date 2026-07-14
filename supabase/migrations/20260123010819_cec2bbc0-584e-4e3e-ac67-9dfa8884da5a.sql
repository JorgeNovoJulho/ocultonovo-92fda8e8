-- Adicionar suporte ao Modo Fantasma na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS has_ghost_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_ghost_active BOOLEAN DEFAULT false;

-- Adicionar configurações do add-on Modo Fantasma
INSERT INTO public.system_settings (key, value, description) VALUES 
  ('ghost_mode_price', '"9.99"', 'Preço mensal do add-on Modo Fantasma'),
  ('ghost_mode_enabled', 'true', 'Habilitar oferta do Modo Fantasma globalmente')
ON CONFLICT (key) DO NOTHING;

-- Comentários para documentação
COMMENT ON COLUMN public.profiles.has_ghost_mode IS 'Indica se o usuário possui o add-on Modo Fantasma';
COMMENT ON COLUMN public.profiles.is_ghost_active IS 'Indica se o Modo Fantasma está ativo (toggle do usuário)';