
-- Adiciona campos KYC ao perfil do usuário
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_type TEXT CHECK (kyc_type IN ('document', 'selfie')),
  ADD COLUMN IF NOT EXISTS kyc_document_url TEXT,
  ADD COLUMN IF NOT EXISTS kyc_selfie_url TEXT,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.kyc_type IS 'Tipo de KYC enviado pelo usuário: document (RG/CNH) ou selfie';
COMMENT ON COLUMN public.profiles.kyc_submitted_at IS 'Timestamp do envio do KYC pelo usuário';

-- Bucket privado para documentos KYC (dados sensíveis)
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Apenas o próprio usuário pode fazer upload na sua pasta
CREATE POLICY "kyc_upload_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
  )
);

-- RLS: Apenas o próprio usuário pode ver seus documentos
CREATE POLICY "kyc_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
  )
);

-- RLS: Admins podem ver todos os documentos KYC
CREATE POLICY "kyc_admin_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND public.is_admin(auth.uid())
);
