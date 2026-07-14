-- Grant anon role INSERT permission on storage.objects so anonymous uploads work
GRANT INSERT ON storage.objects TO anon;
-- Also grant SELECT so getPublicUrl works
GRANT SELECT ON storage.objects TO anon;