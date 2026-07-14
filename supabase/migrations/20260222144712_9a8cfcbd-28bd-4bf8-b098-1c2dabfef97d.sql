-- Add CPF/CNPJ column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;