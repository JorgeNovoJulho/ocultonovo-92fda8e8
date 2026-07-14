-- Allow any authenticated user to create share links (sharing is a social feature)
DROP POLICY IF EXISTS "Creator can insert share links" ON public.media_share_links;

CREATE POLICY "Authenticated users can create share links"
ON public.media_share_links
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also update PAPAESPOSA username to match expected @PAPAESPOSA
UPDATE profiles SET username = 'PAPAESPOSA' WHERE id = '63e136b3-01dd-492b-8311-e6406547488c';
