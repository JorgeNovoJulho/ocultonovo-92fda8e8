-- ============================================================================
-- OCULTO PLAY — Etapa 40: Downloads offline (PWA cache de mídia)
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Idempotente: pode rodar mais de uma vez.
--
-- Escopo:
--   • Tabela `oculto_play_offline_downloads` registra metadados do que o
--     usuário baixou para uso offline (Cache Storage no client).
--   • RLS own-only: cada user vê/insere/remove apenas os seus.
--   • RPCs: record_download, remove_download, list_downloads.
--   • Sem alterar contratos existentes; PPV/VIP continua sendo gateado pela
--     URL que o cliente já tem permissão de acessar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_offline_downloads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL,
  kind            text NOT NULL,
  title           text NULL,
  thumb_url       text NULL,
  media_url       text NOT NULL,
  size_bytes      bigint NULL,
  is_paid         boolean NOT NULL DEFAULT false,
  downloaded_at   timestamptz NOT NULL DEFAULT now(),
  last_played_at  timestamptz NULL,
  UNIQUE (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_oculto_play_offline_user
  ON public.oculto_play_offline_downloads (user_id, downloaded_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_offline_downloads TO authenticated;
GRANT ALL ON public.oculto_play_offline_downloads TO service_role;

ALTER TABLE public.oculto_play_offline_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offline_self_select" ON public.oculto_play_offline_downloads;
CREATE POLICY "offline_self_select"
ON public.oculto_play_offline_downloads
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "offline_self_insert" ON public.oculto_play_offline_downloads;
CREATE POLICY "offline_self_insert"
ON public.oculto_play_offline_downloads
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "offline_self_update" ON public.oculto_play_offline_downloads;
CREATE POLICY "offline_self_update"
ON public.oculto_play_offline_downloads
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "offline_self_delete" ON public.oculto_play_offline_downloads;
CREATE POLICY "offline_self_delete"
ON public.oculto_play_offline_downloads
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- RPC: registrar download
CREATE OR REPLACE FUNCTION public.oculto_play_record_download(
  _item_id    uuid,
  _kind       text,
  _title      text,
  _thumb_url  text,
  _media_url  text,
  _size_bytes bigint DEFAULT NULL,
  _is_paid    boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id  uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  INSERT INTO public.oculto_play_offline_downloads
    (user_id, item_id, kind, title, thumb_url, media_url, size_bytes, is_paid)
  VALUES
    (_uid, _item_id, _kind, _title, _thumb_url, _media_url, _size_bytes, COALESCE(_is_paid, false))
  ON CONFLICT (user_id, item_id) DO UPDATE
    SET media_url     = EXCLUDED.media_url,
        thumb_url     = EXCLUDED.thumb_url,
        title         = EXCLUDED.title,
        kind          = EXCLUDED.kind,
        size_bytes    = EXCLUDED.size_bytes,
        is_paid       = EXCLUDED.is_paid,
        downloaded_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_record_download(uuid, text, text, text, text, bigint, boolean)
  TO authenticated;

-- RPC: remover download
CREATE OR REPLACE FUNCTION public.oculto_play_remove_download(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  DELETE FROM public.oculto_play_offline_downloads
   WHERE user_id = auth.uid()
     AND item_id = _item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_remove_download(uuid) TO authenticated;

-- RPC: listar downloads do usuário
CREATE OR REPLACE FUNCTION public.oculto_play_list_downloads()
RETURNS SETOF public.oculto_play_offline_downloads
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
    FROM public.oculto_play_offline_downloads
   WHERE user_id = auth.uid()
   ORDER BY downloaded_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_list_downloads() TO authenticated;

NOTIFY pgrst, 'reload schema';
