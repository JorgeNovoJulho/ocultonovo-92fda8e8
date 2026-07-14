-- ============================================================================
-- Comunidades — vídeos com capa selecionável + contador de visualizações
-- 100% idempotente. Rode no SQL Editor do Supabase externo.
-- ============================================================================

-- 1) Colunas novas em oculto_community_media (capa do vídeo + view_count)
ALTER TABLE public.oculto_community_media
  ADD COLUMN IF NOT EXISTS cover_url  text,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_oculto_community_media_url
  ON public.oculto_community_media (url);

-- 2) Permitir UPDATE de view_count (caso a RPC não rode como definer / fallback)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='oculto_community_media'
      AND policyname='public increments community video views'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "public increments community video views"
      ON public.oculto_community_media
      FOR UPDATE TO authenticated
      USING (kind = 'video')
      WITH CHECK (kind = 'video');
    $POL$;
  END IF;
END $$;

-- 3) RPC para registrar 1 visualização — security definer, idempotente,
--    e tolerante a race (UPDATE atômico).
CREATE OR REPLACE FUNCTION public.community_media_register_view(_media_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF _media_id IS NULL THEN
    RETURN 0;
  END IF;
  UPDATE public.oculto_community_media
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = _media_id
     AND kind = 'video'
  RETURNING view_count INTO v_count;
  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_media_register_view(uuid)
  TO authenticated, service_role;

-- 4) Variante por URL (útil quando o cliente só tem a URL renderizada).
CREATE OR REPLACE FUNCTION public.community_media_register_view_by_url(_url text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF _url IS NULL OR length(_url) = 0 THEN
    RETURN 0;
  END IF;
  UPDATE public.oculto_community_media
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE url = _url
     AND kind = 'video'
  RETURNING view_count INTO v_count;
  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_media_register_view_by_url(text)
  TO authenticated, service_role;

-- 5) Realtime — REPLICA IDENTITY FULL + publication membership.
ALTER TABLE public.oculto_community_media REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime'
       AND schemaname='public'
       AND tablename='oculto_community_media'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_community_media;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
