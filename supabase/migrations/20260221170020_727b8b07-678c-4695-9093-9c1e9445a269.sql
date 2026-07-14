
-- 1. Add confirmed_age to share_click_tracking
ALTER TABLE public.share_click_tracking
  ADD COLUMN IF NOT EXISTS confirmed_age boolean DEFAULT false;

-- 2. Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by_share_code text,
  ADD COLUMN IF NOT EXISTS external_clicks_count integer DEFAULT 0;

-- 3. Create referral_tree
CREATE TABLE IF NOT EXISTS public.referral_tree (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_source text DEFAULT 'share_link',
  level integer DEFAULT 1,
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_tree_no_self CHECK (parent_id <> child_id),
  CONSTRAINT referral_tree_unique_child UNIQUE (child_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_tree_parent ON public.referral_tree(parent_id);
CREATE INDEX IF NOT EXISTS idx_referral_tree_child ON public.referral_tree(child_id);

ALTER TABLE public.referral_tree ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referral tree entries"
  ON public.referral_tree FOR SELECT
  USING (
    parent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR child_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can insert referral_tree"
  ON public.referral_tree FOR INSERT
  WITH CHECK (true);

-- 4. Function to auto-link referral on signup
CREATE OR REPLACE FUNCTION public.link_share_referral(
  p_child_profile_id uuid,
  p_share_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
  v_click_id uuid;
BEGIN
  SELECT msl.user_id INTO v_referrer_id
  FROM media_share_links msl
  WHERE msl.share_code = p_share_code
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    SELECT sct.referrer_id INTO v_referrer_id
    FROM share_click_tracking sct
    WHERE sct.share_code = p_share_code AND sct.referrer_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_referrer_id IS NULL THEN RETURN; END IF;
  IF v_referrer_id = p_child_profile_id THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM referral_tree WHERE child_id = p_child_profile_id) THEN RETURN; END IF;

  INSERT INTO referral_tree (parent_id, child_id, referral_source, level, status)
  VALUES (v_referrer_id, p_child_profile_id, 'share_link', 1, 'active');

  SELECT id INTO v_click_id
  FROM share_click_tracking
  WHERE share_code = p_share_code AND converted = false
  ORDER BY created_at DESC LIMIT 1;

  IF v_click_id IS NOT NULL THEN
    UPDATE share_click_tracking SET converted = true, converted_user_id = p_child_profile_id WHERE id = v_click_id;
  END IF;

  UPDATE profiles SET referred_by_share_code = p_share_code WHERE id = p_child_profile_id;
END;
$$;

-- 5. View for admin referral network stats
CREATE OR REPLACE VIEW public.referral_network_stats AS
SELECT
  rt.parent_id,
  p.name AS parent_name,
  p.username AS parent_username,
  p.avatar_url AS parent_avatar,
  COUNT(rt.child_id) AS total_children,
  COUNT(CASE WHEN rt.status = 'active' THEN 1 END) AS active_children,
  MIN(rt.created_at) AS first_referral_at
FROM referral_tree rt
JOIN profiles p ON p.id = rt.parent_id
GROUP BY rt.parent_id, p.name, p.username, p.avatar_url;
