-- =====================================================================
-- Discovery Slides — Missões + Campanhas (Fase A + B)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- Adiciona metadados opcionais aos slides existentes sem quebrar nada.
-- =====================================================================

ALTER TABLE public.feed_discovery_slides
  ADD COLUMN IF NOT EXISTS mission_label       text,
  ADD COLUMN IF NOT EXISTS mission_goal        text,
  ADD COLUMN IF NOT EXISTS mission_target      integer,
  ADD COLUMN IF NOT EXISTS campaign_tag        text,
  ADD COLUMN IF NOT EXISTS campaign_color      text;

-- Comentários (opcionais, ajudam no admin)
COMMENT ON COLUMN public.feed_discovery_slides.mission_label   IS 'Rótulo curto da missão (ex.: "Sua Missão")';
COMMENT ON COLUMN public.feed_discovery_slides.mission_goal    IS 'Texto da meta (ex.: "Faça 3 conexões no Aura Match")';
COMMENT ON COLUMN public.feed_discovery_slides.mission_target  IS 'Número alvo, se progresso for contável';
COMMENT ON COLUMN public.feed_discovery_slides.campaign_tag    IS 'Tag visível no card (ex.: "🌙 Semana das Salas")';
COMMENT ON COLUMN public.feed_discovery_slides.campaign_color  IS 'HEX opcional p/ destaque (ex.: "#8b5cf6")';

-- Índice leve para filtrar campanhas vigentes
CREATE INDEX IF NOT EXISTS idx_fds_campaign_active
  ON public.feed_discovery_slides (campaign_tag)
  WHERE campaign_tag IS NOT NULL AND is_active = true;
