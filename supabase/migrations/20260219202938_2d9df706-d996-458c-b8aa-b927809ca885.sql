
-- Fix: Allow users to read perfect_pairs where they are either the sender OR the target
-- This is required so the mutual match detection works correctly

DROP POLICY IF EXISTS "Users can read own pairs" ON public.perfect_pairs;

CREATE POLICY "Users can read own pairs"
ON public.perfect_pairs
FOR SELECT
TO authenticated
USING (
  -- User is the one who sent the like
  auth.uid() = (SELECT user_id FROM public.profiles WHERE id = perfect_pairs.user_id)
  OR
  -- User is the target (needed to detect mutual likes)
  auth.uid() = (SELECT user_id FROM public.profiles WHERE id = perfect_pairs.target_id)
);
