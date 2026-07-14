-- =====================================================================
-- Garante colunas pix_key_type e pix_key (idempotente)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- =====================================================================

-- profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pix_key_type TEXT,
  ADD COLUMN IF NOT EXISTS pix_key TEXT;

-- creator_pricing_config (cria tabela mínima caso não exista, depois adiciona colunas)
CREATE TABLE IF NOT EXISTS public.creator_pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.creator_pricing_config
  ADD COLUMN IF NOT EXISTS pix_key_type TEXT,
  ADD COLUMN IF NOT EXISTS pix_key TEXT;

NOTIFY pgrst, 'reload schema';
