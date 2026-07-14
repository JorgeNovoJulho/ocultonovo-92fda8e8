-- Oculto Play — Links externos (YouTube / Vimeo / TikTok / .mp4 direto)
-- EXECUTE AS 2 SEPARATE QUERIES (enum value must be committed before use)

-- =============================================
-- QUERY 1: Add enum value (run this FIRST, alone)
-- =============================================
ALTER TYPE public.oculto_play_kind ADD VALUE 'link';

-- =============================================
-- QUERY 2: Schema changes (run this AFTER query 1 committed)
-- =============================================
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS source_url    text,
  ADD COLUMN IF NOT EXISTS link_provider text;

CREATE INDEX IF NOT EXISTS oculto_play_items_kind_link_idx
  ON public.oculto_play_items (published_at DESC)
  WHERE kind = 'link';
