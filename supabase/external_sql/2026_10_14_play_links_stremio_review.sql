-- =====================================================================
-- 2026-10-14 — Oculto Play: links que não tocam para outros usuários
--
-- Links magnet (torrent), stremio:// e endereços do computador de quem
-- postou (Stremio em 127.0.0.1:11470, localhost, rede de casa 192.168.x.x,
-- 10.x, 172.16–31.x, portas 11470/12470) só funcionam no PC do autor.
--
-- Este script:
--   1) cria _play_link_unplayable(url) → 'magnet' | 'local' | NULL
--   2) CONGELA os itens existentes com esses links (somem para os outros;
--      o autor continua vendo no próprio canal) — idempotente
--   3) trava no banco: novos itens/edições com esses links são recusados,
--      e itens congelados por esse motivo não podem ser descongelados
--      enquanto o link não for trocado
--   4) relatório final do que foi congelado
-- =====================================================================

-- 1) Detector ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public._play_link_unplayable(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_url IS NULL OR btrim(p_url) = '' THEN NULL
    WHEN lower(btrim(p_url)) LIKE 'magnet:%' THEN 'magnet'
    WHEN lower(btrim(p_url)) LIKE 'stremio:%' THEN 'local'
    WHEN lower(btrim(p_url)) ~ '^https?://(localhost|127\.[0-9]+\.[0-9]+\.[0-9]+|0\.0\.0\.0|\[::1\]|10\.[0-9]+\.[0-9]+\.[0-9]+|192\.168\.[0-9]+\.[0-9]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+)(:[0-9]+)?(/|\?|$)' THEN 'local'
    WHEN lower(btrim(p_url)) ~ '^https?://[^/]+:(11470|12470)(/|\?|$)' THEN 'local'
    ELSE NULL
  END
$$;

ALTER TABLE public.oculto_play_items ADD COLUMN IF NOT EXISTS frozen_reason text;

-- 2) Congela os existentes ----------------------------------------------
UPDATE public.oculto_play_items i
   SET is_frozen     = true,
       frozen_at     = COALESCE(i.frozen_at, now()),
       is_published  = false,
       frozen_reason = 'link_' || public._play_link_unplayable(COALESCE(i.source_url, i.media_url))
 WHERE i.kind = 'link'
   AND public._play_link_unplayable(COALESCE(i.source_url, i.media_url)) IS NOT NULL
   AND (i.is_frozen IS DISTINCT FROM true OR i.frozen_reason IS NULL);

-- 3) Trava ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._play_items_unplayable_link_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_reason text;
  v_url_changed boolean;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'link' THEN
    RETURN NEW;
  END IF;

  v_reason := public._play_link_unplayable(COALESCE(NEW.source_url, NEW.media_url));

  IF TG_OP = 'INSERT' THEN
    v_url_changed := true;
  ELSE
    v_url_changed := (NEW.source_url IS DISTINCT FROM OLD.source_url)
                  OR (NEW.media_url  IS DISTINCT FROM OLD.media_url);
  END IF;

  -- Link novo/trocado para magnet/local → recusa.
  IF v_reason IS NOT NULL AND v_url_changed THEN
    RAISE EXCEPTION 'link_unplayable: links % não tocam para outros usuários', v_reason
      USING ERRCODE = 'check_violation',
            HINT = 'Envie o arquivo ou use MP4, HLS (.m3u8), YouTube, Vimeo, Internet Archive ou Google Drive.';
  END IF;

  -- Item com link magnet/local não pode voltar a ficar visível.
  IF v_reason IS NOT NULL AND TG_OP = 'UPDATE'
     AND (COALESCE(NEW.is_frozen, false) = false OR COALESCE(NEW.is_published, false) = true) THEN
    NEW.is_frozen     := true;
    NEW.is_published  := false;
    NEW.frozen_at     := COALESCE(NEW.frozen_at, now());
    NEW.frozen_reason := 'link_' || v_reason;
  END IF;

  -- Link trocado por um válido: libera o congelamento automático.
  IF v_reason IS NULL AND TG_OP = 'UPDATE' AND v_url_changed
     AND OLD.frozen_reason LIKE 'link_%' THEN
    NEW.frozen_reason := NULL;
    NEW.is_frozen     := false;
    NEW.frozen_at     := NULL;
    NEW.is_published  := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_play_items_unplayable_link_guard ON public.oculto_play_items;
CREATE TRIGGER trg_play_items_unplayable_link_guard
  BEFORE INSERT OR UPDATE ON public.oculto_play_items
  FOR EACH ROW EXECUTE FUNCTION public._play_items_unplayable_link_guard();

-- 4) Relatório ------------------------------------------------------------
SELECT i.id,
       i.title,
       p.username            AS autor,
       i.frozen_reason       AS motivo,
       left(COALESCE(i.source_url, i.media_url), 80) AS link
  FROM public.oculto_play_items i
  LEFT JOIN public.profiles p ON p.id = i.author_id
 WHERE i.frozen_reason LIKE 'link_%'
 ORDER BY i.created_at DESC;
