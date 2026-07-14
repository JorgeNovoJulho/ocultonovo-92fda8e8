-- ============================================================================
-- Aura Match — Classificar salas REGULARES vs ESPECIAIS por allow-list
--
-- Regulares (sempre visíveis): tema_livre, energia_vip, lounge_solteiros,
--   adoramos_menage, influencia_vip, aura_elite, energia_livre.
-- Todas as demais salas em oculto_aura_rooms são consideradas ESPECIAIS:
--   recebem mood='especial' e tag 'especial', e só aparecem no feed quando
--   houver sessão ativa em oculto_special_cycle_sessions.
--
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- Garante as colunas (no-op se já existem)
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS mood text;

-- Lista de slugs aceitos como "regulares" (variações com hífen e underline)
WITH regular_slugs(slug) AS (
  VALUES
    ('tema_livre'),        ('tema-livre'),
    ('energia_vip'),       ('energia-vip'),
    ('lounge_solteiros'),  ('lounge-solteiros'),
    ('adoramos_menage'),   ('adoramos-menage'),
    ('influencia_vip'),    ('influencia-vip'),
    ('aura_elite'),        ('aura-elite'),
    ('energia_livre'),     ('energia-livre')
),
-- 1) Limpa marcação "especial" de salas regulares (caso tenha vazado)
clean_regular AS (
  UPDATE public.oculto_aura_rooms r
     SET mood = CASE WHEN r.mood = 'especial' THEN NULL ELSE r.mood END,
         tags = ARRAY(
           SELECT t FROM unnest(COALESCE(r.tags, '{}'::text[])) AS t
            WHERE t IS DISTINCT FROM 'especial'
         )
   WHERE r.slug IN (SELECT slug FROM regular_slugs)
  RETURNING r.slug
)
-- 2) Marca como ESPECIAL todas as demais salas ativas
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
   AND r.slug NOT IN (SELECT slug FROM regular_slugs);

-- 3) Garante que toda definição de ciclo especial tenha sua sala
--    em oculto_aura_rooms já marcada como especial.
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
 WHERE d.room_slug = r.slug;

NOTIFY pgrst, 'reload schema';
