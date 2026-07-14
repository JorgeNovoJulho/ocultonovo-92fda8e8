
-- Adiciona coluna 'is_oculto_verified' para o selo exclusivo da plataforma OcultoSwing
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_oculto_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_oculto_verified IS 'Selo exclusivo OcultoSwing: concedido manualmente a membros verificados pela plataforma';
