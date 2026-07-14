
-- Table to track video transcoding jobs
CREATE TABLE public.video_transcoding_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  original_url TEXT NOT NULL,
  master_url TEXT,
  preview_url TEXT,
  hls_manifest_url TEXT,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.video_transcoding_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs" ON public.video_transcoding_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON public.video_transcoding_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "System can update jobs" ON public.video_transcoding_jobs FOR UPDATE USING (true);

CREATE INDEX idx_vtj_post_id ON public.video_transcoding_jobs(post_id);
CREATE INDEX idx_vtj_status ON public.video_transcoding_jobs(status);

-- Add video processing columns to posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_master_url TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_preview_url TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_hls_url TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_processing_status TEXT DEFAULT 'none';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_vtj_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_vtj_updated_at
BEFORE UPDATE ON public.video_transcoding_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_vtj_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.video_transcoding_jobs;
