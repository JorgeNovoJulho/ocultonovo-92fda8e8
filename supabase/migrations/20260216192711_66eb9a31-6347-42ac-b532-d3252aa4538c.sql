-- Create banners storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload banners
CREATE POLICY "Users can upload their own banners"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'banners' AND auth.uid() IS NOT NULL);

-- Allow public read access for banners
CREATE POLICY "Banners are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

-- Allow users to update their own banners
CREATE POLICY "Users can update their own banners"
ON storage.objects FOR UPDATE
USING (bucket_id = 'banners' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own banners
CREATE POLICY "Users can delete their own banners"
ON storage.objects FOR DELETE
USING (bucket_id = 'banners' AND auth.uid()::text = (storage.foldername(name))[1]);
