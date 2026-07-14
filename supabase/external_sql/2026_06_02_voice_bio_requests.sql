-- =====================================================================
-- Voice Bio Requests — pedidos de "bio em áudio" por usuário
-- Executar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_voice_bio_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oculto_voice_bio_requests_unique UNIQUE (owner_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_ovbr_owner ON public.oculto_voice_bio_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_ovbr_requester ON public.oculto_voice_bio_requests(requester_id);

GRANT SELECT, INSERT ON public.oculto_voice_bio_requests TO authenticated;
GRANT ALL ON public.oculto_voice_bio_requests TO service_role;

ALTER TABLE public.oculto_voice_bio_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ovbr_select_all_auth" ON public.oculto_voice_bio_requests;
CREATE POLICY "ovbr_select_all_auth"
  ON public.oculto_voice_bio_requests
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ovbr_insert_self" ON public.oculto_voice_bio_requests;
CREATE POLICY "ovbr_insert_self"
  ON public.oculto_voice_bio_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id AND auth.uid() <> owner_id);
