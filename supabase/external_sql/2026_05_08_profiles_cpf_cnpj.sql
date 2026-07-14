-- Adiciona coluna cpf_cnpj em profiles (idempotente)
-- Necessário para checkout PIX/Cartão (Asaas exige CPF/CNPJ do pagador)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf_cnpj text;

-- Índice parcial: apenas linhas com valor (evita custo em NULLs)
CREATE INDEX IF NOT EXISTS idx_profiles_cpf_cnpj
  ON public.profiles (cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL;

-- Força refresh do schema cache do PostgREST (resolve "Could not find column in schema cache")
NOTIFY pgrst, 'reload schema';
