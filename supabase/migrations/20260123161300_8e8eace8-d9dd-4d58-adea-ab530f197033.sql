-- Adicionar coluna is_test_account para identificar perfis de teste stealth
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_test_account boolean DEFAULT false;

-- Criar índice para busca rápida de perfis de teste
CREATE INDEX IF NOT EXISTS idx_profiles_is_test_account ON public.profiles(is_test_account) WHERE is_test_account = true;

-- Comentário explicativo
COMMENT ON COLUMN public.profiles.is_test_account IS 'Identifica perfis de teste stealth que são invisíveis para usuários reais mas operam normalmente para testes administrativos';