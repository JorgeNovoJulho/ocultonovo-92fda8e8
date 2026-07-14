-- Create hero-audio storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('hero-audio', 'hero-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Policy for public read access
CREATE POLICY "Public hero audio read"
ON storage.objects FOR SELECT
USING (bucket_id = 'hero-audio');

-- Policy for admin uploads
CREATE POLICY "Admin hero audio upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'hero-audio' 
  AND EXISTS (
    SELECT 1 FROM admin_staff 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Policy for admin updates
CREATE POLICY "Admin hero audio update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'hero-audio' 
  AND EXISTS (
    SELECT 1 FROM admin_staff 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Policy for admin deletes
CREATE POLICY "Admin hero audio delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'hero-audio' 
  AND EXISTS (
    SELECT 1 FROM admin_staff 
    WHERE user_id = auth.uid() AND is_active = true
  )
);