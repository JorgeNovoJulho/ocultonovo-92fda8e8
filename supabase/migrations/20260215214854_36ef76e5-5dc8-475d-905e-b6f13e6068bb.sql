-- Allow creator_founder_applications without user_id (for unauthenticated applicants)
ALTER TABLE public.creator_founder_applications ALTER COLUMN user_id DROP NOT NULL;

-- Add contact fields for unauthenticated applicants
ALTER TABLE public.creator_founder_applications ADD COLUMN IF NOT EXISTS applicant_name TEXT;
ALTER TABLE public.creator_founder_applications ADD COLUMN IF NOT EXISTS applicant_email TEXT;

-- Update RLS to allow anonymous inserts
DROP POLICY IF EXISTS "Anyone can submit founder application" ON public.creator_founder_applications;
CREATE POLICY "Anyone can submit founder application"
  ON public.creator_founder_applications
  FOR INSERT
  WITH CHECK (true);

-- Keep existing select/update policies as-is