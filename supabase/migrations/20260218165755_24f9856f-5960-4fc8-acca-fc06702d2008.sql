-- =====================================================
-- SECURITY AUDIT: Fix Critical Vulnerabilities (final)
-- =====================================================

-- ── 1. PROFILES: Drop overly permissive policies ──
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users see own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users see profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users see public profiles" ON public.profiles;

-- Own profile always accessible
CREATE POLICY "Users see own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Other active, non-anonymized profiles
CREATE POLICY "Authenticated users see public profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    account_status = 'active'
    AND (is_anonymized IS NULL OR is_anonymized = false)
    AND (is_shadowbanned IS NULL OR is_shadowbanned = false)
  );

-- ── 2. Safe public view - strips all sensitive fields ──
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = on)
AS
  SELECT
    id,
    user_id,
    name,
    username,
    avatar_url,
    cover_image_url,
    bio,
    is_creator,
    is_verified,
    plan_type,
    is_online,
    show_online_status,
    hide_age,
    hide_location,
    partner1_name,
    partner2_name,
    gender,
    gender_other,
    is_verified_couple,
    tags_social,
    tags_adult,
    connection_mode,
    pair_photos,
    pair_bio,
    show_on_radar,
    voice_bio_url,
    voice_bio_duration,
    is_pioneiro,
    is_vip,
    vip_tier,
    updated_at
  FROM public.profiles
  WHERE
    account_status = 'active'
    AND (is_anonymized IS NULL OR is_anonymized = false);

-- ── 3. STORAGE: Revoke anonymous write access ──
REVOKE INSERT ON storage.objects FROM anon;
REVOKE UPDATE ON storage.objects FROM anon;
REVOKE DELETE ON storage.objects FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA storage FROM anon;

-- ── 4. WITHDRAWAL REQUESTS: Owner only ──
DROP POLICY IF EXISTS "Users view own withdrawals" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Admins view all withdrawals" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Anyone can view withdrawal_requests" ON public.withdrawal_requests;

CREATE POLICY "Users view own withdrawals"
  ON public.withdrawal_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── 5. TRANSACTIONS: Owner only ──
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
CREATE POLICY "Users can view their own transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── 6. POST_LIKES: Authenticated only ──
DROP POLICY IF EXISTS "Post likes are viewable by everyone" ON public.post_likes;
DROP POLICY IF EXISTS "Authenticated users can view post likes" ON public.post_likes;
CREATE POLICY "Authenticated users can view post likes"
  ON public.post_likes FOR SELECT
  TO authenticated
  USING (true);

-- ── 7. SAVED_POSTS: Owner only ──
DROP POLICY IF EXISTS "Users can view their saved posts" ON public.saved_posts;
DROP POLICY IF EXISTS "Saved posts owner only" ON public.saved_posts;
CREATE POLICY "Saved posts owner only"
  ON public.saved_posts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());