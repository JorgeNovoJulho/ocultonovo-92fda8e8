-- ============================================================================
-- Filtro Global de Gênero no Feed — idempotente
-- Cria 3 colunas em public.profiles:
--   feed_filter_categories     text[]     -- subset de {homem,mulher,casal,lgbtqia}
--   feed_filter_chosen_at      timestamptz
--   feed_filter_prompt_required boolean DEFAULT true
-- Para usuários existentes (sem escolha feita) forçamos prompt_required=true,
-- garantindo que o modal apareça no próximo login — uma única vez.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_filter_categories text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS feed_filter_chosen_at   timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS feed_filter_prompt_required boolean DEFAULT true;

-- Defaults para colunas booleanas em linhas que possam ter ficado NULL.
UPDATE public.profiles
   SET feed_filter_prompt_required = COALESCE(feed_filter_prompt_required, true);

-- Força exibição do modal no PRÓXIMO login para todos os usuários antigos
-- que ainda não responderam o filtro.
UPDATE public.profiles
   SET feed_filter_prompt_required = true
 WHERE feed_filter_chosen_at IS NULL;

COMMENT ON COLUMN public.profiles.feed_filter_categories IS
  'Filtro global de gênero do feed. Subset de {homem,mulher,casal,lgbtqia}. NULL ou array vazio = sem filtro.';
COMMENT ON COLUMN public.profiles.feed_filter_chosen_at IS
  'Quando o usuário escolheu/atualizou o filtro de gênero do feed.';
COMMENT ON COLUMN public.profiles.feed_filter_prompt_required IS
  'Quando true, o modal de filtro de gênero deve ser exibido no próximo login.';
