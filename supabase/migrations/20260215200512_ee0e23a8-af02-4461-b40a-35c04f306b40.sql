
-- Fix the security definer view issue by dropping and recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.user_referral_children;

CREATE OR REPLACE VIEW public.user_referral_children 
WITH (security_invoker = true)
AS
SELECT 
  cr.madrinha_id AS parent_id,
  COUNT(cr.afilhada_id) AS children_count,
  COALESCE(SUM(cr.total_commission_earned), 0) AS total_earned,
  ARRAY_AGG(cr.afilhada_id) AS children_ids
FROM public.creator_referrals cr
WHERE cr.is_active = true
GROUP BY cr.madrinha_id;
