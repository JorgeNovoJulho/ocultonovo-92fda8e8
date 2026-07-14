
-- Table for profile likes (who liked your profile, separate from post likes)
CREATE TABLE public.profile_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  liker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  liked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_ghost BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(liker_id, liked_id)
);

-- Enable RLS
ALTER TABLE public.profile_likes ENABLE ROW LEVEL SECURITY;

-- Users can see likes they received
CREATE POLICY "Users can see likes they received"
  ON public.profile_likes FOR SELECT
  USING (liked_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Users can see likes they gave
CREATE POLICY "Users can see likes they gave"
  ON public.profile_likes FOR SELECT
  USING (liker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Users can insert their own likes
CREATE POLICY "Users can like profiles"
  ON public.profile_likes FOR INSERT
  WITH CHECK (liker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Users can remove their own likes
CREATE POLICY "Users can unlike profiles"
  ON public.profile_likes FOR DELETE
  USING (liker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Service role can do everything (for ghost likes from edge functions)
CREATE POLICY "Service role full access"
  ON public.profile_likes FOR ALL
  USING (auth.role() = 'service_role');

-- Performance indexes
CREATE INDEX idx_profile_likes_liked_id ON public.profile_likes(liked_id, created_at DESC);
CREATE INDEX idx_profile_likes_liker_id ON public.profile_likes(liker_id);
CREATE INDEX idx_profile_likes_ghost ON public.profile_likes(is_ghost) WHERE is_ghost = true;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_likes;
