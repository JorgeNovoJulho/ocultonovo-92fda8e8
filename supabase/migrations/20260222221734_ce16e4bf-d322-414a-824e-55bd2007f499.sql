-- Fix RLS policies to match the FK constraint (user_id references profiles.id)
DROP POLICY IF EXISTS "Authenticated users can save posts" ON public.saved_posts;
DROP POLICY IF EXISTS "Authenticated users can unsave posts" ON public.saved_posts;
DROP POLICY IF EXISTS "Saved posts owner only" ON public.saved_posts;

CREATE POLICY "Users can save posts"
ON public.saved_posts FOR INSERT
WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can unsave posts"
ON public.saved_posts FOR DELETE
USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view saved posts"
ON public.saved_posts FOR SELECT
USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));