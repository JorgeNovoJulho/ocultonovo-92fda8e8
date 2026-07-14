
DROP POLICY IF EXISTS "Users can purchase media" ON public.media_access;
CREATE POLICY "Admin master can insert media_access"
ON public.media_access FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin_master'));

DROP POLICY IF EXISTS "Users can create unlocks" ON public.media_unlocks;
CREATE POLICY "Admin master can insert media_unlocks"
ON public.media_unlocks FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin_master'));

DROP POLICY IF EXISTS "Authenticated users can create share links" ON public.media_share_links;
DROP POLICY IF EXISTS "Authenticated update share links" ON public.media_share_links;
CREATE POLICY "Owner can create share links"
ON public.media_share_links FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.posts p JOIN public.profiles pr ON pr.id = p.user_id
          WHERE p.id = media_share_links.post_id AND pr.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Anyone can view share links by code" ON public.media_share_links;
CREATE POLICY "View non-expired share links"
ON public.media_share_links FOR SELECT
USING (expires_at IS NULL OR expires_at > now());

CREATE OR REPLACE FUNCTION public.has_paid_for_post(_post_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.media_access ma WHERE ma.post_id = _post_id AND ma.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.posts p JOIN public.profiles pr ON pr.id = p.user_id
               WHERE p.id = _post_id AND pr.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = _post_id AND public.has_active_subscription(p.user_id));
$$;
GRANT EXECUTE ON FUNCTION public.has_paid_for_post(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_purchased_item(_item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.marketplace_purchases mp JOIN public.profiles pr ON pr.id = mp.buyer_id
                 WHERE mp.item_id = _item_id AND pr.user_id = auth.uid()
                   AND mp.status IN ('completed','paid','active'));
$$;
GRANT EXECUTE ON FUNCTION public.has_purchased_item(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_media_access_user_post ON public.media_access (user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_buyer_item ON public.marketplace_purchases (buyer_id, item_id);
CREATE INDEX IF NOT EXISTS idx_media_share_links_code ON public.media_share_links (share_code);

ALTER TABLE public.marketplace_purchases DROP CONSTRAINT IF EXISTS marketplace_purchases_status_check;
ALTER TABLE public.marketplace_purchases
  ADD CONSTRAINT marketplace_purchases_status_check
  CHECK (status IN ('pending','completed','paid','active','cancelled','refunded','failed'));
