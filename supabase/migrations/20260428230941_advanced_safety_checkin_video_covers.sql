ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

ALTER TABLE public.safety_checkins
  ADD COLUMN IF NOT EXISTS meeting_profile_url TEXT,
  ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tracking_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deactivation_pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS deactivation_pin_salt TEXT,
  ADD COLUMN IF NOT EXISTS tracking_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_stopped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_stopped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.safety_checkin_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES public.safety_checkins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  maps_url TEXT,
  waze_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.safety_checkin_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES public.safety_checkins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.safety_checkin_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES public.safety_checkins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  audio_url TEXT NOT NULL,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.safety_checkin_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_checkin_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_checkin_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own safety locations" ON public.safety_checkin_locations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own safety attachments" ON public.safety_checkin_attachments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own safety recordings" ON public.safety_checkin_recordings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_safety_locations_checkin_created ON public.safety_checkin_locations(checkin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_attachments_checkin ON public.safety_checkin_attachments(checkin_id);
CREATE INDEX IF NOT EXISTS idx_safety_recordings_checkin ON public.safety_checkin_recordings(checkin_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'safety-evidence',
  'safety-evidence',
  false,
  104857600,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf','audio/webm','audio/mp4','audio/mpeg','video/mp4','video/webm']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own safety evidence" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'safety-evidence' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own safety evidence" ON storage.objects
  FOR SELECT USING (bucket_id = 'safety-evidence' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own safety evidence" ON storage.objects
  FOR DELETE USING (bucket_id = 'safety-evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
