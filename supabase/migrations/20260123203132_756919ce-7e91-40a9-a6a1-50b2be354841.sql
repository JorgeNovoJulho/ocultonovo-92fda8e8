-- =====================================================
-- PART 1: Super DM Revenue Timeline Function
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_super_dm_revenue_timeline(
  p_profile_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  date DATE,
  revenue NUMERIC,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.date::DATE,
    COALESCE(SUM(pt.amount), 0) as revenue,
    COUNT(pt.id)::BIGINT as count
  FROM (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::DATE as date
  ) d
  LEFT JOIN priority_transactions pt ON 
    pt.receiver_id = p_profile_id 
    AND pt.created_at::DATE = d.date
  GROUP BY d.date
  ORDER BY d.date ASC;
END;
$$;

-- =====================================================
-- PART 2: Broadcast Scheduling Fields
-- =====================================================

ALTER TABLE broadcasts 
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN DEFAULT false;

-- Index for finding pending scheduled broadcasts
CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled_pending 
ON broadcasts(scheduled_for) 
WHERE is_scheduled = true AND status = 'pending';

-- =====================================================
-- PART 3: Function to check if user is admin master
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_admin_master(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'admin_master'
  );
$$;