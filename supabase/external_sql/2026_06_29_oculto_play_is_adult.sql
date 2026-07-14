-- Adiciona flag +18 para itens do Oculto Play (cards de Filmes / Vídeos via link).
-- Idempotente: pode rodar várias vezes.
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS is_adult boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS oculto_play_items_is_adult_idx
  ON public.oculto_play_items (is_adult)
  WHERE is_adult = true;

COMMENT ON COLUMN public.oculto_play_items.is_adult IS
  'Quando true, o conteúdo é exclusivamente +18 e deve aparecer apenas em seções específicas (ex.: Filmes +18).';
