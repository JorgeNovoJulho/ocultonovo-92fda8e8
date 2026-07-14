
-- Grant table-level privileges on storage.objects to anon and authenticated
GRANT ALL ON storage.objects TO anon;
GRANT ALL ON storage.objects TO authenticated;

-- Also grant usage on storage schema
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;

-- Grant sequence access if needed
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO authenticated;
