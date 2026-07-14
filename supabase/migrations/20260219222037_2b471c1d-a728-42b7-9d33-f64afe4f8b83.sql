
-- Fix banner storage RLS policies for reliable upsert

-- Drop existing banner policies to recreate them properly
DROP POLICY IF EXISTS "Users can upload their own banners" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own banners" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own banners" ON storage.objects;
DROP POLICY IF EXISTS "Banners are publicly accessible" ON storage.objects;

-- Recreate: public read
CREATE POLICY "Banners are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

-- INSERT: authenticated users can upload to their own folder (userId/banner.webp)
CREATE POLICY "Users can upload their own banners"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'banners'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- UPDATE: authenticated users can overwrite their own banner (needed for upsert)
CREATE POLICY "Users can update their own banners"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'banners'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'banners'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- DELETE: authenticated users can delete their own banner
CREATE POLICY "Users can delete their own banners"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'banners'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
