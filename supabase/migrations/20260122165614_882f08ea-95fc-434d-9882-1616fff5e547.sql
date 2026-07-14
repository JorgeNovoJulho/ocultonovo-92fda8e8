-- Create storage bucket for post media
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true);

-- Policy: Anyone can view post media
CREATE POLICY "Anyone can view post media"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-media');

-- Policy: Authenticated users can upload their own media
CREATE POLICY "Authenticated users can upload post media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'post-media' AND auth.uid() IS NOT NULL);

-- Policy: Users can update their own uploaded media
CREATE POLICY "Users can update own post media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can delete their own uploaded media
CREATE POLICY "Users can delete own post media"
ON storage.objects FOR DELETE
USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);