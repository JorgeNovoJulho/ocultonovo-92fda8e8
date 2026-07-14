-- Drop restrictive upload policy
DROP POLICY "Users upload own founder media" ON storage.objects;

-- Create permissive upload policy for anyone (anon + authenticated)
CREATE POLICY "Anyone can upload founder media"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'founder-media');