CREATE TABLE IF NOT EXISTS public.oculto_marketplace_ads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  short_description text NOT NULL,
  full_description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  main_image_url text NOT NULL,
  gallery_images text[] NOT NULL DEFAULT ARRAY[]::text[],
  video_url text,
  advertiser_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  external_url text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  views_count integer NOT NULL DEFAULT 0,
  clicks_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gallery_max_10 CHECK (array_length(gallery_images, 1) IS NULL OR array_length(gallery_images, 1) <= 10)
);

CREATE INDEX IF NOT EXISTS idx_oculto_ads_active ON public.oculto_marketplace_ads(is_active, display_order DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_ads_advertiser ON public.oculto_marketplace_ads(advertiser_profile_id);

ALTER TABLE public.oculto_marketplace_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active ads"
  ON public.oculto_marketplace_ads FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "Only master admin can insert ads"
  ON public.oculto_marketplace_ads FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "Only master admin can update ads"
  ON public.oculto_marketplace_ads FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "Only master admin can delete ads"
  ON public.oculto_marketplace_ads FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'));

CREATE OR REPLACE FUNCTION public.update_oculto_ads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_oculto_ads_updated_at
  BEFORE UPDATE ON public.oculto_marketplace_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_oculto_ads_updated_at();

CREATE TABLE IF NOT EXISTS public.oculto_user_reputation (
  profile_id uuid NOT NULL PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  total_reviews integer NOT NULL DEFAULT 0,
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_user_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reputation"
  ON public.oculto_user_reputation FOR SELECT
  USING (true);

CREATE POLICY "Only master admin can upsert reputation"
  ON public.oculto_user_reputation FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "Only master admin can update reputation"
  ON public.oculto_user_reputation FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'));

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'enable_marketplace_ads',
  'false'::jsonb,
  'Habilita exibicao de anuncios marketplace no feed principal'
)
ON CONFLICT (key) DO NOTHING;
