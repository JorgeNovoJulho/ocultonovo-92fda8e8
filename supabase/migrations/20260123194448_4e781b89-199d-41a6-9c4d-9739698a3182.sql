-- =====================================================
-- SHADOWBAN SYSTEM - Database Infrastructure
-- =====================================================

-- 1. Add shadowban columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_shadowbanned boolean DEFAULT false;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS shadowbanned_at timestamp with time zone;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS shadowbanned_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS shadowban_reason text;

-- 2. Update discipline_history action_type to include shadowban actions
-- First drop the existing constraint if it exists
DO $$ 
BEGIN
  ALTER TABLE public.discipline_history 
  DROP CONSTRAINT IF EXISTS discipline_history_action_type_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Add the updated constraint with shadowban actions
ALTER TABLE public.discipline_history 
ADD CONSTRAINT discipline_history_action_type_check 
CHECK (action_type IN ('freeze', 'unfreeze', 'ban', 'restore', 'warning', 'grant_plan', 'delete_data', 'shadowban', 'unshadowban'));

-- 3. Create index for efficient shadowban queries
CREATE INDEX IF NOT EXISTS idx_profiles_shadowbanned ON public.profiles(is_shadowbanned) WHERE is_shadowbanned = true;

-- 4. Update RLS policies for posts to hide shadowbanned user content
-- Drop existing policy first
DROP POLICY IF EXISTS "Public posts are viewable by everyone" ON public.posts;
DROP POLICY IF EXISTS "Posts viewable with shadowban filter" ON public.posts;

-- Create new policy that filters shadowbanned users' posts from public view
CREATE POLICY "Posts viewable with shadowban filter" ON public.posts
FOR SELECT USING (
  -- The author always sees their own posts
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR
  (
    -- Public posts are visible if author is not shadowbanned
    privacy_level = 'public' 
    AND NOT EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = posts.user_id 
      AND is_shadowbanned = true
    )
  )
  OR
  (
    -- VIP posts visible to subscribers (if author not shadowbanned)
    privacy_level = 'vip'
    AND NOT EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = posts.user_id 
      AND is_shadowbanned = true
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions 
      WHERE subscriber_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      AND creator_id = posts.user_id
      AND status = 'active'
    )
  )
);

-- 5. Update RLS policies for post_comments to hide shadowbanned user comments
DROP POLICY IF EXISTS "Anyone can view comments" ON public.post_comments;
DROP POLICY IF EXISTS "Comments viewable with shadowban filter" ON public.post_comments;

CREATE POLICY "Comments viewable with shadowban filter" ON public.post_comments
FOR SELECT USING (
  -- The author always sees their own comments
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR
  -- Others see comments only if author is not shadowbanned
  NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = post_comments.user_id 
    AND is_shadowbanned = true
  )
);

-- 6. Update RLS policies for post_likes to hide shadowbanned user likes
DROP POLICY IF EXISTS "Anyone can view likes" ON public.post_likes;
DROP POLICY IF EXISTS "Likes viewable with shadowban filter" ON public.post_likes;

CREATE POLICY "Likes viewable with shadowban filter" ON public.post_likes
FOR SELECT USING (
  -- The author always sees their own likes
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR
  -- Others see likes only if user is not shadowbanned
  NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = post_likes.user_id 
    AND is_shadowbanned = true
  )
);