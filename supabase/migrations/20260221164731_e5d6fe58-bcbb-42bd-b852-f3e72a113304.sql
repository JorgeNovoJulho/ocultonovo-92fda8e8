
-- =====================================================
-- 1. LANDING SETTINGS TABLE (admin-configurable)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.landing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.landing_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings (public landing needs them)
CREATE POLICY "Anyone can read landing settings"
  ON public.landing_settings FOR SELECT USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage landing settings"
  ON public.landing_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default settings
INSERT INTO public.landing_settings (setting_key, setting_value) VALUES
  ('texts', '{"headline": "Descubra o que está por trás do OCULTO", "subheadline": "Conteúdos exclusivos, conexões reais e experiências únicas te esperam.", "cta_button": "Revelar Segredos", "blur_message": "Quer ver mais? Torne-se membro do OCULTO", "video_message": "Continue assistindo no app", "footer_text": "Uma comunidade exclusiva para quem busca experiências autênticas."}'::jsonb),
  ('style', '{"primary_color": "#D4AF37", "secondary_color": "#1a1a2e", "font_heading": "Inter", "font_body": "Inter", "logo_url": null}'::jsonb),
  ('timers', '{"image_preview_seconds": 5, "video_preview_seconds": 10}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- =====================================================
-- 2. SHARE CLICK TRACKING TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.share_click_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code text NOT NULL,
  referrer_id uuid REFERENCES public.profiles(id),
  promotion_id uuid,
  session_hash text,
  ip_hash text,
  user_agent text,
  converted boolean DEFAULT false,
  converted_user_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_share_clicks_code ON public.share_click_tracking(share_code);
CREATE INDEX idx_share_clicks_referrer ON public.share_click_tracking(referrer_id);
CREATE INDEX idx_share_clicks_created ON public.share_click_tracking(created_at DESC);

ALTER TABLE public.share_click_tracking ENABLE ROW LEVEL SECURITY;

-- Public insert (edge function with service role)
CREATE POLICY "Anyone can insert share clicks"
  ON public.share_click_tracking FOR INSERT WITH CHECK (true);

-- Users can see their own referral clicks
CREATE POLICY "Users can view own referral clicks"
  ON public.share_click_tracking FOR SELECT
  USING (referrer_id = (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- 3. SHARE CLICK STATS VIEW (for dashboards)
-- =====================================================
CREATE OR REPLACE VIEW public.share_click_stats AS
SELECT
  referrer_id,
  COUNT(*) as total_clicks,
  COUNT(*) FILTER (WHERE converted = true) as total_conversions,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as clicks_today,
  COUNT(*) FILTER (WHERE converted = true AND created_at >= CURRENT_DATE) as conversions_today,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as clicks_week,
  COUNT(*) FILTER (WHERE converted = true AND created_at >= CURRENT_DATE - INTERVAL '7 days') as conversions_week
FROM public.share_click_tracking
GROUP BY referrer_id;

-- Enable realtime on landing_settings for instant admin preview
ALTER PUBLICATION supabase_realtime ADD TABLE public.landing_settings;
