-- =====================================================
-- 1. FOLLOWS TABLE (Sistema de Seguidores)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);

-- RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follows"
ON public.follows FOR SELECT
USING (true);

CREATE POLICY "Users can follow others"
ON public.follows FOR INSERT
WITH CHECK (follower_id IN (
  SELECT id FROM profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can unfollow"
ON public.follows FOR DELETE
USING (follower_id IN (
  SELECT id FROM profiles WHERE user_id = auth.uid()
));

-- =====================================================
-- 2. POST DISLIKES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.post_dislikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_post_dislikes_post ON public.post_dislikes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_dislikes_user ON public.post_dislikes(user_id);

-- RLS
ALTER TABLE public.post_dislikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view dislikes"
ON public.post_dislikes FOR SELECT
USING (true);

CREATE POLICY "Users can dislike posts"
ON public.post_dislikes FOR INSERT
WITH CHECK (user_id IN (
  SELECT id FROM profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can remove dislike"
ON public.post_dislikes FOR DELETE
USING (user_id IN (
  SELECT id FROM profiles WHERE user_id = auth.uid()
));

-- =====================================================
-- 3. ADD DISLIKES_COUNT TO POSTS
-- =====================================================
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS dislikes_count INTEGER DEFAULT 0;

-- =====================================================
-- 4. TRIGGER FUNCTION FOR REACTION COUNTS
-- =====================================================
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_post_dislikes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET dislikes_count = dislikes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET dislikes_count = GREATEST(0, dislikes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_likes_count ON public.post_likes;
DROP TRIGGER IF EXISTS trigger_update_dislikes_count ON public.post_dislikes;

-- Create triggers
CREATE TRIGGER trigger_update_likes_count
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW
EXECUTE FUNCTION update_post_likes_count();

CREATE TRIGGER trigger_update_dislikes_count
AFTER INSERT OR DELETE ON public.post_dislikes
FOR EACH ROW
EXECUTE FUNCTION update_post_dislikes_count();

-- =====================================================
-- 5. ENABLE REALTIME FOR FOLLOWS AND DISLIKES
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_dislikes;