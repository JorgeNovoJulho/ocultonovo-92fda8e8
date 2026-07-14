
-- Add media_type and video_duration to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER DEFAULT NULL;

-- Add referral_children tracking view (count of "filhos" per user)
CREATE OR REPLACE VIEW public.user_referral_children AS
SELECT 
  cr.madrinha_id AS parent_id,
  COUNT(cr.afilhada_id) AS children_count,
  COALESCE(SUM(cr.total_commission_earned), 0) AS total_earned,
  ARRAY_AGG(cr.afilhada_id) AS children_ids
FROM public.creator_referrals cr
WHERE cr.is_active = true
GROUP BY cr.madrinha_id;
