-- Drop existing objects if they exist from failed migration
DROP TABLE IF EXISTS public.hero_advanced_settings CASCADE;
DROP FUNCTION IF EXISTS public.update_hero_settings_updated_at CASCADE;

-- Hero Advanced Settings Table
CREATE TABLE public.hero_advanced_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Background Media
  background_type TEXT DEFAULT 'gradient' CHECK (background_type IN ('gradient', 'image', 'video')),
  background_image_url TEXT,
  background_video_url TEXT,
  
  -- Intelligent Audio System (Day/Night)
  audio_enabled BOOLEAN DEFAULT false,
  audio_track_day TEXT,
  audio_track_night TEXT,
  audio_default_volume DECIMAL(3,2) DEFAULT 0.30 CHECK (audio_default_volume >= 0 AND audio_default_volume <= 1),
  audio_visualizer_enabled BOOLEAN DEFAULT true,
  
  -- Day/Night Time Configuration
  day_start_hour INTEGER DEFAULT 6 CHECK (day_start_hour >= 0 AND day_start_hour <= 23),
  night_start_hour INTEGER DEFAULT 18 CHECK (night_start_hour >= 0 AND night_start_hour <= 23),
  
  -- Dynamic Texts (separate for Day and Night)
  texts_day JSONB DEFAULT '{
    "badge": "🔥 Lançamento Exclusivo",
    "title_line1": "Onde Casais",
    "title_line2": "Se Encontram",
    "subtitle": "Conecte-se com casais em {cidade} que compartilham suas fantasias mais ocultas",
    "cta_primary": "Explorar",
    "cta_secondary": "Espiar"
  }'::jsonb,
  texts_night JSONB DEFAULT '{
    "badge": "🌙 Modo Noturno Ativo",
    "title_line1": "Onde Desejos",
    "title_line2": "Ganham Vida",
    "subtitle": "Descubra casais em {cidade} prontos para noites inesquecíveis",
    "cta_primary": "Entrar",
    "cta_secondary": "Espiar"
  }'::jsonb,
  
  -- Parallax Effect Speeds
  parallax_moon_speed DECIMAL(3,2) DEFAULT 0.15,
  parallax_stars_speed DECIMAL(3,2) DEFAULT 0.08,
  parallax_city_speed DECIMAL(3,2) DEFAULT 0.05,
  
  -- Visual Effects
  stars_count INTEGER DEFAULT 80 CHECK (stars_count >= 10 AND stars_count <= 200),
  enable_floating_particles BOOLEAN DEFAULT true,
  moon_glow_intensity DECIMAL(3,2) DEFAULT 0.80,
  
  -- Typewriter/Rotating Words
  rotating_words JSONB DEFAULT '["Ocultas", "Proibidas", "Secretas", "Íntimas"]'::jsonb,
  typewriter_speed_ms INTEGER DEFAULT 100,
  typewriter_pause_ms INTEGER DEFAULT 2000,
  
  -- Geo Personalization
  enable_geo_replacement BOOLEAN DEFAULT true,
  geo_fallback_city TEXT DEFAULT 'sua cidade',
  
  -- A/B Testing
  ab_test_enabled BOOLEAN DEFAULT false,
  ab_test_variant_b JSONB DEFAULT '{}'::jsonb,
  
  -- Trust Indicators
  trust_indicators JSONB DEFAULT '{
    "online_count": true,
    "anonymity_badge": true,
    "age_verified_badge": true
  }'::jsonb,
  
  -- Scroll Indicator
  show_scroll_indicator BOOLEAN DEFAULT true,
  scroll_indicator_delay_ms INTEGER DEFAULT 5000,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.hero_advanced_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Anyone can read (public landing page)
CREATE POLICY "Anyone can read hero settings"
  ON public.hero_advanced_settings
  FOR SELECT
  USING (true);

-- Admins can manage hero settings (using admin_staff table)
CREATE POLICY "Admins can manage hero settings"
  ON public.hero_advanced_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_staff
      WHERE admin_staff.user_id = auth.uid()
      AND admin_staff.is_active = true
    )
  );

-- Insert default settings
INSERT INTO public.hero_advanced_settings (id) 
VALUES (gen_random_uuid());

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_hero_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_hero_advanced_settings_updated_at
  BEFORE UPDATE ON public.hero_advanced_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_hero_settings_updated_at();