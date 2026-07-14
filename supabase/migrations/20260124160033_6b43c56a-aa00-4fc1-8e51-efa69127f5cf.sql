-- FASE 1: Complemento da migração
-- =====================================================

-- 3. FLASH SALE - Settings adicionais (corrigido - usar null ao invés de string vazia)
INSERT INTO public.system_settings (key, value, description) VALUES
  ('flash_sale_active', 'false', 'Indica se a flash sale está ativa'),
  ('flash_sale_discount', '10', 'Percentual de desconto da flash sale'),
  ('flash_sale_expires_at', 'null', 'Data/hora de expiração da flash sale')
ON CONFLICT (key) DO NOTHING;

-- 4. HERO - Contador de cadastros hoje
ALTER TABLE public.hero_advanced_settings 
ADD COLUMN IF NOT EXISTS show_signups_today boolean DEFAULT false;