
-- Add founder terms acceptance tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS founder_terms_accepted_at timestamptz DEFAULT NULL;
