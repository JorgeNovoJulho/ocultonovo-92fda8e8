-- Add new columns for moon positioning and size
ALTER TABLE hero_advanced_settings 
ADD COLUMN IF NOT EXISTS moon_size integer DEFAULT 550,
ADD COLUMN IF NOT EXISTS moon_position_x integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS moon_position_y integer DEFAULT 15;

-- Update the texts structure with new fields
UPDATE hero_advanced_settings SET
  texts_day = jsonb_build_object(
    'badge', '🚀 Lançamento Exclusivo',
    'main_title', 'OCULTO',
    'paragraph', 'A primeira plataforma que une **conteúdo exclusivo adulto +18** e **encontros reais**. Para criadores monetizarem seus conteudos, fazer renda extra e obter fãs. Para pessoas liberais interagirem entre si e promoverem encontros reais e realizar todos os seus **desejos** e **fantasias** mais ocultos.',
    'geo_line', 'Encontros reais em: {cidade}',
    'cta_label', 'COMECE AGORA GRÁTIS',
    'cta_primary', 'Criar Conta',
    'cta_secondary', 'Espiar'
  ),
  texts_night = jsonb_build_object(
    'badge', '🌙 Modo Noturno Ativo',
    'main_title', 'OCULTO',
    'paragraph', 'A primeira plataforma que une **conteúdo exclusivo adulto +18** e **encontros reais**. Para criadores monetizarem seus conteudos, fazer renda extra e obter fãs. Para pessoas liberais interagirem entre si e promoverem encontros reais e realizar todos os seus **desejos** e **fantasias** mais ocultos.',
    'geo_line', 'Encontros reais em: {cidade}',
    'cta_label', 'COMECE AGORA GRÁTIS',
    'cta_primary', 'Entrar',
    'cta_secondary', 'Espiar'
  ),
  moon_size = 550,
  moon_position_x = 50,
  moon_position_y = 15
WHERE id IS NOT NULL;