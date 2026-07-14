
-- Add media_urls array column to posts for multi-image stories
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT NULL;

-- Set default post_type for existing flash stories
UPDATE public.posts SET post_type = 'story' WHERE is_flash = true AND (post_type IS NULL OR post_type = '');

-- Set default post_type for existing feed posts
UPDATE public.posts SET post_type = 'feed' WHERE (is_flash IS NULL OR is_flash = false) AND (post_type IS NULL OR post_type = '');
