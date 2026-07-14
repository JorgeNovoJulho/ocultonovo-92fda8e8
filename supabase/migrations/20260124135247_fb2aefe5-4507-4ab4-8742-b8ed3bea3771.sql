-- Criar bucket para áudios do hero
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hero-audio',
  'hero-audio',
  true,
  52428800,
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- Política de leitura pública
CREATE POLICY "Public read hero audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'hero-audio');

-- Política de upload para admins autenticados
CREATE POLICY "Authenticated upload hero audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'hero-audio' AND auth.role() = 'authenticated');