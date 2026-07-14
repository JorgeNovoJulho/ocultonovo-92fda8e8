-- =====================================================================
-- Adiciona coluna `description` à tabela transactions (idempotente)
-- Corrige: "Could not find the 'description' column of 'transactions'
-- in the schema cache" ao gerar PIX no CheckoutPage / Destaque Dourado.
-- =====================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS description text;

-- Refresh do schema cache do PostgREST para reconhecer imediatamente
NOTIFY pgrst, 'reload schema';
