
DROP TABLE IF EXISTS public.subscription_plans CASCADE;

CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Plano VIP',
  bio TEXT,
  banner_url TEXT,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 29.90,
  annual_price NUMERIC(10,2),
  lifetime_price NUMERIC(10,2),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "creators_manage_own_plans"
ON public.subscription_plans FOR ALL
USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "public_read_enabled_plans"
ON public.subscription_plans FOR SELECT
USING (is_enabled = true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('plan-banners', 'plan-banners', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "plan_banners_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'plan-banners');
CREATE POLICY "plan_banners_auth_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'plan-banners' AND auth.role() = 'authenticated');
CREATE POLICY "plan_banners_auth_update" ON storage.objects FOR UPDATE USING (bucket_id = 'plan-banners' AND auth.role() = 'authenticated');
CREATE POLICY "plan_banners_auth_delete" ON storage.objects FOR DELETE USING (bucket_id = 'plan-banners' AND auth.role() = 'authenticated');
