-- =====================================================================
-- Fix: feed exibia "Usuário/@usuario" em todos os cards.
-- Causa raiz: a query do feed pedia colunas profiles.banned_at e
-- profiles.frozen_until que NÃO existiam no Supabase externo. PostgREST
-- devolvia 42703 e o profileMap ficava vazio → todo card caía no
-- fallback "Usuário".
--
-- Este script é idempotente. Adiciona as colunas opcionais usadas pela
-- engine de moderação/disciplina (banido/congelado). Pode ser rodado
-- quantas vezes for necessário, sem efeitos colaterais.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS frozen_until timestamptz NULL;

COMMENT ON COLUMN public.profiles.banned_at IS
  'Quando preenchido, o perfil está banido. Lido pelo feed para esconder posts.';
COMMENT ON COLUMN public.profiles.frozen_until IS
  'Data até a qual o perfil está congelado. Quando > now() bloqueia interações.';

-- Índices parciais para filtros rápidos de moderação no admin.
CREATE INDEX IF NOT EXISTS idx_profiles_banned_at
  ON public.profiles (banned_at) WHERE banned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_frozen_until
  ON public.profiles (frozen_until) WHERE frozen_until IS NOT NULL;
