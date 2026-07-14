-- Make the bucket public so anon can upload
UPDATE storage.buckets SET public = true WHERE id = 'founder-media';