-- Fix 1: record_profile_visit - add ownership verification
CREATE OR REPLACE FUNCTION public.record_profile_visit(
  p_visitor_id UUID,
  p_visited_id UUID
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  visitor_user_id UUID;
BEGIN
  -- Prevent self-visits
  IF p_visitor_id = p_visited_id THEN
    RETURN;
  END IF;

  -- Get the user_id of the visitor profile
  SELECT user_id INTO visitor_user_id
  FROM profiles
  WHERE id = p_visitor_id;

  -- Verify the caller owns the visitor profile
  IF visitor_user_id IS NULL OR visitor_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Can only record visits as yourself';
  END IF;

  -- Check for existing visit within the last hour (dedup)
  IF EXISTS (
    SELECT 1 FROM profile_visits
    WHERE visitor_id = p_visitor_id
      AND visited_id = p_visited_id
      AND visited_at > now() - interval '1 hour'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO profile_visits (visitor_id, visited_id)
  VALUES (p_visitor_id, p_visited_id);
END;
$$ LANGUAGE plpgsql;

-- Fix 2: Restrict plan-banners to creators/admins only
DROP POLICY IF EXISTS "plan_banners_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "plan_banners_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "plan_banners_auth_delete" ON storage.objects;

CREATE POLICY "plan_banners_creator_upload" ON storage.objects 
  FOR INSERT WITH CHECK (
    bucket_id = 'plan-banners' 
    AND auth.role() = 'authenticated'
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_creator = true)
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master'))
    )
  );

CREATE POLICY "plan_banners_creator_update" ON storage.objects 
  FOR UPDATE USING (
    bucket_id = 'plan-banners'
    AND auth.role() = 'authenticated'
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_creator = true)
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master'))
    )
  );

CREATE POLICY "plan_banners_creator_delete" ON storage.objects 
  FOR DELETE USING (
    bucket_id = 'plan-banners'
    AND auth.role() = 'authenticated'
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_creator = true)
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master'))
    )
  );