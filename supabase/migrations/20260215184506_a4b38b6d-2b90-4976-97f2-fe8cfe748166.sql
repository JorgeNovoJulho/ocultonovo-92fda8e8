
-- Creator Founders system
CREATE TABLE public.creator_founder_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  social_links JSONB NOT NULL DEFAULT '{}',
  career_description TEXT NOT NULL,
  photo_url TEXT,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_founder_applications ENABLE ROW LEVEL SECURITY;

-- Users can see and manage their own applications
CREATE POLICY "Users can view own applications"
  ON public.creator_founder_applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applications"
  ON public.creator_founder_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all applications"
  ON public.creator_founder_applications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update applications"
  ON public.creator_founder_applications FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Creator Founders tracking table
CREATE TABLE public.creator_founders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.creator_founder_applications(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  free_period_ends TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '365 days'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_founders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view founders"
  ON public.creator_founders FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage founders"
  ON public.creator_founders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- View for vacancy status
CREATE OR REPLACE VIEW public.founder_vagas_status AS
SELECT 
  COUNT(*)::int AS filled,
  50 - COUNT(*)::int AS remaining,
  50 AS total,
  COUNT(*) >= 50 AS is_full
FROM public.creator_founders
WHERE is_active = true;

-- RPC to approve a founder
CREATE OR REPLACE FUNCTION public.approve_creator_founder(
  p_application_id UUID,
  p_admin_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_remaining INT;
BEGIN
  -- Check admin role
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Check vacancies
  SELECT remaining INTO v_remaining FROM public.founder_vagas_status;
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'No vacancies remaining';
  END IF;

  -- Get user_id from application
  SELECT user_id INTO v_user_id
  FROM public.creator_founder_applications
  WHERE id = p_application_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Application not found or already processed';
  END IF;

  -- Update application
  UPDATE public.creator_founder_applications
  SET status = 'approved', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id;

  -- Create founder record
  INSERT INTO public.creator_founders (user_id, application_id)
  VALUES (v_user_id, p_application_id);

  -- Update profile to VIP creator
  UPDATE public.profiles
  SET plan_type = 'vip_creator', payment_status = 'active', updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- Storage bucket for founder media
INSERT INTO storage.buckets (id, name, public) VALUES ('founder-media', 'founder-media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own founder media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'founder-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users view own founder media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'founder-media' AND (auth.uid()::text = (storage.foldername(name))[1] OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')));

CREATE POLICY "Admins delete founder media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'founder-media' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_creator_founder_applications_updated_at
  BEFORE UPDATE ON public.creator_founder_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
