INSERT INTO storage.buckets (id, name, public) VALUES ('support_attachments', 'support_attachments', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload support attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'support_attachments');

CREATE POLICY "Public read support attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'support_attachments');
