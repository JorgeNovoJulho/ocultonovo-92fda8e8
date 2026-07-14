-- =====================================================================
-- Salas temáticas reais por ciclo especial
-- Backend externo. Idempotente.
-- Objetivo:
-- 1) dar um slug de sala próprio para cada ciclo especial
-- 2) criar/atualizar as salas reais em oculto_aura_rooms
-- 3) migrar sessões abertas/closing para o slug correto
-- =====================================================================

ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS required_plan text,
  ADD COLUMN IF NOT EXISTS requires_kyc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS couple_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_aura_level smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_social_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_prestige_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS glow_intensity smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS sort_order smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowed_genders text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS max_capacity smallint NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS open_to_all boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reputation_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mood text,
  ADD COLUMN IF NOT EXISTS rising_threshold smallint NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS last_rising_at timestamptz;

WITH cycle_map AS (
  SELECT * FROM (VALUES
    ('pico_noite',         'ciclo-pico-noite',        'Pico da Noite',      '🌆', 320, 'Sala temática automática do ciclo especial de pico noturno.',      10, 18),
    ('calmaria_madrugada', 'ciclo-madrugada-acordada','Madrugada Acordada', '🌙', 260, 'Sala temática automática da madrugada acordada.',                  11, 16),
    ('bom_dia_social',     'ciclo-bom-dia-social',    'Bom Dia Social',     '🌅',  25, 'Sala temática automática para o ciclo matinal.',                  12, 16),
    ('aconchego_chuvoso',  'ciclo-aconchego-chuvoso', 'Aconchego Chuvoso',  '🌧️', 200, 'Sala temática automática ativada em clima chuvoso.',              13, 14),
    ('esquenta_frio',      'ciclo-esquenta-clima',    'Esquenta o Clima',   '❄️', 210, 'Sala temática automática ativada em clima frio.',                 14, 14)
  ) AS t(cycle_key, room_slug, room_name, emoji, hue, description, sort_order, max_capacity)
),
definitions_upsert AS (
  INSERT INTO public.oculto_special_cycle_definitions (
    key, label, emoji, hue, room_slug, day_parts, weather_kinds,
    min_aura_level, min_social_score, min_prestige_xp,
    required_plan, requires_kyc, max_duration_minutes, description, active
  )
  SELECT
    m.cycle_key,
    m.room_name,
    m.emoji,
    m.hue,
    m.room_slug,
    COALESCE(d.day_parts, '{}'::text[]),
    COALESCE(d.weather_kinds, '{}'::text[]),
    COALESCE(d.min_aura_level, 0),
    COALESCE(d.min_social_score, 0),
    COALESCE(d.min_prestige_xp, 0),
    d.required_plan,
    COALESCE(d.requires_kyc, false),
    COALESCE(d.max_duration_minutes, 180),
    COALESCE(d.description, m.description),
    COALESCE(d.active, true)
  FROM cycle_map m
  LEFT JOIN public.oculto_special_cycle_definitions d
    ON d.key = m.cycle_key
  ON CONFLICT (key) DO UPDATE SET
    label                = EXCLUDED.label,
    emoji                = EXCLUDED.emoji,
    hue                  = EXCLUDED.hue,
    room_slug            = EXCLUDED.room_slug,
    min_aura_level       = EXCLUDED.min_aura_level,
    min_social_score     = EXCLUDED.min_social_score,
    min_prestige_xp      = EXCLUDED.min_prestige_xp,
    required_plan        = EXCLUDED.required_plan,
    requires_kyc         = EXCLUDED.requires_kyc,
    max_duration_minutes = EXCLUDED.max_duration_minutes,
    description          = EXCLUDED.description,
    active               = EXCLUDED.active
  RETURNING key, room_slug, label, emoji, hue, description, min_aura_level, min_social_score, min_prestige_xp, required_plan, requires_kyc
)
INSERT INTO public.oculto_aura_rooms (
  slug, name, theme, hue, emoji, active, vip_only, required_plan, requires_kyc,
  couple_only, min_aura_level, min_social_score, min_prestige_xp, hour_from, hour_to,
  description, glow_intensity, sort_order, allowed_genders, max_capacity, open_to_all,
  reputation_score, mood, rising_threshold
)
SELECT
  du.room_slug,
  du.label,
  du.description,
  du.hue,
  du.emoji,
  true,
  lower(COALESCE(du.required_plan, '')) = 'vip',
  du.required_plan,
  du.requires_kyc,
  false,
  du.min_aura_level::smallint,
  du.min_social_score,
  du.min_prestige_xp,
  NULL,
  NULL,
  du.description,
  82,
  COALESCE(cm.sort_order, 10),
  '{}'::text[],
  COALESCE(cm.max_capacity, 14)::smallint,
  false,
  0,
  'especial',
  65
FROM definitions_upsert du
LEFT JOIN cycle_map cm ON cm.cycle_key = du.key
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  theme            = EXCLUDED.theme,
  hue              = EXCLUDED.hue,
  emoji            = EXCLUDED.emoji,
  active           = true,
  vip_only         = EXCLUDED.vip_only,
  required_plan    = EXCLUDED.required_plan,
  requires_kyc     = EXCLUDED.requires_kyc,
  couple_only      = EXCLUDED.couple_only,
  min_aura_level   = EXCLUDED.min_aura_level,
  min_social_score = EXCLUDED.min_social_score,
  min_prestige_xp  = EXCLUDED.min_prestige_xp,
  description      = EXCLUDED.description,
  glow_intensity   = EXCLUDED.glow_intensity,
  sort_order       = EXCLUDED.sort_order,
  max_capacity     = EXCLUDED.max_capacity,
  open_to_all      = EXCLUDED.open_to_all,
  mood             = EXCLUDED.mood,
  rising_threshold = EXCLUDED.rising_threshold;

WITH cycle_map AS (
  SELECT * FROM (VALUES
    ('pico_noite',         'ciclo-pico-noite'),
    ('calmaria_madrugada', 'ciclo-madrugada-acordada'),
    ('bom_dia_social',     'ciclo-bom-dia-social'),
    ('aconchego_chuvoso',  'ciclo-aconchego-chuvoso'),
    ('esquenta_frio',      'ciclo-esquenta-clima')
  ) AS t(cycle_key, room_slug)
)
UPDATE public.oculto_special_cycle_sessions s
   SET room_slug = cm.room_slug
  FROM cycle_map cm
 WHERE s.cycle_key = cm.cycle_key
   AND s.status IN ('open', 'closing')
   AND s.room_slug IS DISTINCT FROM cm.room_slug;

SELECT public.special_cycle_tick();

NOTIFY pgrst, 'reload schema';