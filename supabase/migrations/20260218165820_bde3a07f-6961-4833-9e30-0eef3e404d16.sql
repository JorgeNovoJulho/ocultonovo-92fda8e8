-- Fix Security Definer View warning - profiles_public should use security_invoker not definer
-- The WITH (security_invoker=on) syntax IS correct for security_invoker views.
-- Fix functions with mutable search_path by adding SET search_path = public

-- Fix common utility functions that may be missing search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix permissive INSERT/UPDATE/DELETE RLS policies
-- post_likes INSERT: should only allow authenticated users to insert for themselves
DROP POLICY IF EXISTS "Users can like posts" ON public.post_likes;
DROP POLICY IF EXISTS "Authenticated users can like posts" ON public.post_likes;
CREATE POLICY "Authenticated users can like posts"
  ON public.post_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- post_likes DELETE: only own likes
DROP POLICY IF EXISTS "Users can unlike posts" ON public.post_likes;
DROP POLICY IF EXISTS "Authenticated users can unlike posts" ON public.post_likes;
CREATE POLICY "Authenticated users can unlike posts"
  ON public.post_likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- saved_posts INSERT: own records only
DROP POLICY IF EXISTS "Users can save posts" ON public.saved_posts;
DROP POLICY IF EXISTS "Authenticated users can save posts" ON public.saved_posts;
CREATE POLICY "Authenticated users can save posts"
  ON public.saved_posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- saved_posts DELETE: own records only
DROP POLICY IF EXISTS "Users can unsave posts" ON public.saved_posts;
DROP POLICY IF EXISTS "Authenticated users can unsave posts" ON public.saved_posts;
CREATE POLICY "Authenticated users can unsave posts"
  ON public.saved_posts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Ensure posts INSERT requires owner check
DROP POLICY IF EXISTS "Users can create posts" ON public.posts;
CREATE POLICY "Users can create posts"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
CREATE POLICY "Users can update own posts"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;
CREATE POLICY "Users can delete own posts"
  ON public.posts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());