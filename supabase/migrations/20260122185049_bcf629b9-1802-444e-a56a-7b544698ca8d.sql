-- Add is_seed column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_seed boolean DEFAULT false;

-- Add is_seed column to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS is_seed boolean DEFAULT false;

-- Add is_seed column to post_likes table
ALTER TABLE public.post_likes 
ADD COLUMN IF NOT EXISTS is_seed boolean DEFAULT false;

-- Create index for faster seed data queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_seed ON public.profiles(is_seed) WHERE is_seed = true;
CREATE INDEX IF NOT EXISTS idx_posts_is_seed ON public.posts(is_seed) WHERE is_seed = true;
CREATE INDEX IF NOT EXISTS idx_post_likes_is_seed ON public.post_likes(is_seed) WHERE is_seed = true;

-- Create function to delete all seed data (for admin use)
CREATE OR REPLACE FUNCTION public.purge_seed_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_profiles integer;
  deleted_posts integer;
  deleted_likes integer;
BEGIN
  -- Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Delete seed likes first (due to foreign keys)
  DELETE FROM public.post_likes WHERE is_seed = true;
  GET DIAGNOSTICS deleted_likes = ROW_COUNT;

  -- Delete seed posts
  DELETE FROM public.posts WHERE is_seed = true;
  GET DIAGNOSTICS deleted_posts = ROW_COUNT;

  -- Delete seed profiles
  DELETE FROM public.profiles WHERE is_seed = true;
  GET DIAGNOSTICS deleted_profiles = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_profiles', deleted_profiles,
    'deleted_posts', deleted_posts,
    'deleted_likes', deleted_likes
  );
END;
$$;