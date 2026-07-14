-- Add seen_at column to track when the liked user viewed the like
ALTER TABLE public.profile_likes ADD COLUMN IF NOT EXISTS seen_at timestamptz DEFAULT NULL;

-- Index for efficient unseen count queries
CREATE INDEX IF NOT EXISTS idx_profile_likes_unseen 
  ON public.profile_likes (liked_id, seen_at) 
  WHERE seen_at IS NULL;