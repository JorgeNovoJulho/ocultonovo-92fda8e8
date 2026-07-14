-- =====================================================================
-- Tag "especial" para TODAS as salas de ciclos especiais
-- Backend externo. Idempotente.
--
-- Objetivo:
--   1) Adicionar coluna `tags text[]` em oculto_special_cycle_definitions
--      e em oculto_aura_rooms (se ainda não existir).
--   2) Garantir que toda definição de ciclo especial carregue a tag
--      'especial' (além de uma tag por categoria: time/weekday/weather/
--      season/energy/vip).
--   3) Criar automaticamente uma sala em oculto_aura_rooms para cada
--      room_slug declarado em definitions que ainda não tenha sala,
--      sempre marcada com tags = {'especial', <categoria>} e
--      mood = 'especial'.
--   4) Backfill: marcar com 'especial' todas as salas já existentes que
--      são alvo de um ciclo especial.
-- =====================================================================

-- 1) Colunas tags ----------------------------------------------------------
ALTER TABLE public.oculto_special_cycle_definitions
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_aura_rooms_tags
  ON public.oculto_aura_rooms USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_special_defs_tags
  ON public.oculto_special_cycle_definitions USING GIN (tags);

-- 2) Definitions: tag 'especial' + tag da categoria -----------------------
UPDATE public.oculto_special_cycle_definitions
   SET tags = (
     SELECT ARRAY(
       SELECT DISTINCT t FROM unnest(
         COALESCE(tags, '{}'::text[]) || ARRAY['especial', COALESCE(category, 'time')]
       ) AS t WHERE t IS NOT NULL AND t <> ''
     )
   )
 WHERE NOT ('especial' = ANY(COALESCE(tags, '{}'::text[])))
    OR NOT (COALESCE(category,'time') = ANY(COALESCE(tags, '{}'::text[])));

-- 3) Criar oculto_aura_rooms faltantes para cada room_slug de ciclo --------
INSERT INTO public.oculto_aura_rooms (
  slug, name, theme, hue, emoji, active, vip_only, required_plan, requires_kyc,
  couple_only, min_aura_level, min_social_score, min_prestige_xp,
  description, glow_intensity, sort_order, max_capacity, open_to_all,
  mood, tags
)
SELECT
  d.room_slug,
  d.label,
  COALESCE(d.description, d.label),
  d.hue,
  d.emoji,
  true,
  LOWER(COALESCE(d.required_plan,'')) = 'vip',
  d.required_plan,
  COALESCE(d.requires_kyc, false),
  COALESCE(d.couple_only, false),
  COALESCE(d.min_aura_level, 0)::smallint,
  COALESCE(d.min_social_score, 0),
  COALESCE(d.min_prestige_xp, 0),
  COALESCE(d.description, d.label),
  COALESCE(d.glow_intensity, 80)::smallint,
  COALESCE(d.sort_order, 100)::smallint,
  COALESCE(d.max_members, 50)::smallint,
  false,
  'especial',
  ARRAY['especial', COALESCE(d.category,'time')]
FROM public.oculto_special_cycle_definitions d
WHERE d.room_slug IS NOT NULL
  AND d.room_slug NOT IN (SELECT slug FROM public.oculto_aura_rooms)
ON CONFLICT (slug) DO NOTHING;

-- 4) Backfill em salas já existentes vinculadas a ciclos especiais --------
UPDATE public.oculto_aura_rooms r
   SET tags = (
         SELECT ARRAY(
           SELECT DISTINCT t FROM unnest(
             COALESCE(r.tags, '{}'::text[]) || ARRAY['especial', COALESCE(d.category,'time')]
           ) AS t WHERE t IS NOT NULL AND t <> ''
         )
       ),
       mood = COALESCE(r.mood, 'especial')
  FROM public.oculto_special_cycle_definitions d
 WHERE d.room_slug = r.slug
   AND (
        NOT ('especial' = ANY(COALESCE(r.tags, '{}'::text[])))
     OR NOT (COALESCE(d.category,'time') = ANY(COALESCE(r.tags, '{}'::text[])))
   );

NOTIFY pgrst, 'reload schema';
