-- Create bucket for seed data backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('seed-backups', 'seed-backups', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Only admins can read backups
CREATE POLICY "Admins can read seed backups"
ON storage.objects FOR SELECT
USING (bucket_id = 'seed-backups' AND is_admin(auth.uid()));

-- RLS: Only service role can insert (edge function uses service key)
CREATE POLICY "Service can insert seed backups"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'seed-backups');