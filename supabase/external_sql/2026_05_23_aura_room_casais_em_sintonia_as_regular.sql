-- ============================================================================
-- Aura Match — Inclui "Casais em Sintonia" na ALLOWLIST de salas REGULARES
--
-- A sala 'casais-em-sintonia' (variação: 'casais_em_sintonia') estava sendo
-- marcada como ESPECIAL pela migração anterior (allowlist sem ela).
-- Esta migração:
--   1) Remove 'especial' do mood/tags de TODAS as variações dessa sala.
--   2) Re-aplica varredura: qualquer sala ativa NÃO presente na nova allowlist
--      (agora com 'casais-em-sintonia') permanece ESPECIAL.
--   3) Garante que toda definição em oculto_special_cycle_definitions
--      continua marcada como especial.
--
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- Garante colunas (no-op se já existem)
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS mood text;

WITH regular_slugs(slug) AS (
  VALUES
    ('tema_livre'),          ('tema-livre'),
    ('energia_vip'),         ('energia-vip'),
    ('lounge_solteiros'),    ('lounge-solteiros'),
    ('adoramos_menage'),     ('adoramos-menage'),
    ('influencia_vip'),      ('influencia-vip'),
    ('aura_elite'),          ('aura-elite'),
    ('energia_livre'),       ('energia-livre'),
    ('casais_em_sintonia'),  ('casais-em-sintonia')
)
-- 1) Limpa marcação "especial" de qualquer sala regular
, clean_regular AS (
  UPDATE public.oculto_aura_rooms r
     SET mood = CASE WHEN r.mood = 'especial' THEN NULL ELSE r.mood END,
         tags = ARRAY(
           SELECT t FROM unnest(COALESCE(r.tags, '{}'::text[])) AS t
            WHERE t IS DISTINCT FROM 'especial'
         )
   WHERE r.slug IN (SELECT slug FROM regular_slugs)
  RETURNING r.slug
)
-- 2) Re-marca como ESPECIAL todas as demais salas ativas
UPDATE public.oculto_aura_rooms r
   SET mood = 'especial',
       tags = (
         SELECT ARRAY(
           SELECT DISTINCT t FROM unnest(
             COALESCE(r.tags, '{}'::text[]) || ARRAY['especial']
           ) AS t WHERE t IS NOT NULL AND t <> ''
         )
       )
 WHERE r.active = true
   AND r.slug NOT IN (
     'tema_livre','tema-livre',
     'energia_vip','energia-vip',
     'lounge_solteiros','lounge-solteiros',
     'adoramos_menage','adoramos-menage',
     'influencia_vip','influencia-vip',
     'aura_elite','aura-elite',
     'energia_livre','energia-livre',
     'casais_em_sintonia','casais-em-sintonia'
   );

-- 3) Garante que definições de ciclo especial sigam marcadas
UPDATE public.oculto_aura_rooms r
   SET mood = 'especial',
       tags = (
         SELECT ARRAY(
           SELECT DISTINCT t FROM unnest(
             COALESCE(r.tags, '{}'::text[]) || ARRAY['especial']
           ) AS t WHERE t IS NOT NULL AND t <> ''
         )
       )
  FROM public.oculto_special_cycle_definitions d
 WHERE d.room_slug = r.slug
   AND r.slug NOT IN ('casais_em_sintonia','casais-em-sintonia');

NOTIFY pgrst, 'reload schema';
