-- ============================================================
-- Figurinhas pessoais do usuário (importadas do dispositivo)
-- Rodar manualmente no SQL Editor do Supabase EXTERNO.
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_user_stickers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         text NOT NULL,
  storage_path text,
  mime_type   text,
  size_bytes  bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oculto_user_stickers_user_idx
  ON public.oculto_user_stickers (user_id, created_at DESC);

-- Evita duplicar a mesma figurinha por usuário
CREATE UNIQUE INDEX IF NOT EXISTS oculto_user_stickers_user_url_uidx
  ON public.oculto_user_stickers (user_id, url);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_user_stickers TO authenticated;
GRANT ALL ON public.oculto_user_stickers TO service_role;

ALTER TABLE public.oculto_user_stickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_stickers_select_own" ON public.oculto_user_stickers;
CREATE POLICY "user_stickers_select_own"
  ON public.oculto_user_stickers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_stickers_insert_own" ON public.oculto_user_stickers;
CREATE POLICY "user_stickers_insert_own"
  ON public.oculto_user_stickers FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_stickers_delete_own" ON public.oculto_user_stickers;
CREATE POLICY "user_stickers_delete_own"
  ON public.oculto_user_stickers FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
