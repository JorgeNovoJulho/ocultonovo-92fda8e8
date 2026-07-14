
-- Fix RLS policy on profile_visits: visited_id stores profile.id, not auth.uid()
-- The current policy uses auth.uid() = visited_id which is wrong because
-- visited_id references profiles.id, not auth.users.id

DROP POLICY IF EXISTS "Users can view visits to their profile" ON public.profile_visits;

CREATE POLICY "Users can view visits to their profile"
ON public.profile_visits
FOR SELECT
TO authenticated
USING (
  visited_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Also fix INSERT policy to use profile.id comparison correctly
DROP POLICY IF EXISTS "Users can record their visits" ON public.profile_visits;

CREATE POLICY "Users can record their visits"
ON public.profile_visits
FOR INSERT
TO authenticated
WITH CHECK (
  visitor_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND visitor_id <> visited_id
);
