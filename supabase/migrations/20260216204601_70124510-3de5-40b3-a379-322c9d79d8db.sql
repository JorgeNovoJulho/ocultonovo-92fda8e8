
-- Add is_invisible column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_invisible boolean DEFAULT false;

-- Create index for radar filtering
CREATE INDEX IF NOT EXISTS idx_profiles_is_invisible ON public.profiles(is_invisible) WHERE is_invisible = true;
