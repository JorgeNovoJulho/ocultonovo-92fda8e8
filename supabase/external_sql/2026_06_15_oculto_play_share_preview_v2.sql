-- 2026_06_15 — Versiona links de compartilhamento do OCULTO PLAY para recache social (?v=2)
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Não altera RLS nem cria tabelas. Apenas normaliza URLs persistidas que apontam para /play/p ou /play/share.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'oculto_play_items'
      AND column_name = 'share_url'
  ) THEN
    UPDATE public.oculto_play_items
    SET share_url = 'https://ocultoswing.com.br/play/p/' || id::text || '?v=2',
        updated_at = now()
    WHERE share_url IS NULL
       OR share_url ~ '^https?://(www\.)?ocultoswing\.com\.br/play/(p|share)/'
       OR share_url ~ '^/play/(p|share)/';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'share_link'
  ) THEN
    UPDATE public.posts
    SET share_link = 'https://ocultoswing.com.br/play/p/' || oculto_play_item_id::text || '?v=2',
        updated_at = now()
    WHERE oculto_play_item_id IS NOT NULL
      AND (
        share_link IS NULL
        OR share_link ~ '^https?://(www\.)?ocultoswing\.com\.br/play/(p|share)/'
        OR share_link ~ '^/play/(p|share)/'
      );
  END IF;
END $$;

-- Relatório final seguro: não quebra se alguma coluna opcional ainda não existir.
CREATE TEMP TABLE IF NOT EXISTS tmp_oculto_play_share_preview_report (
  origem text,
  links_play_com_v2 bigint
) ON COMMIT DROP;

TRUNCATE tmp_oculto_play_share_preview_report;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'oculto_play_items'
      AND column_name = 'share_url'
  ) THEN
    EXECUTE $sql$
      INSERT INTO tmp_oculto_play_share_preview_report (origem, links_play_com_v2)
      SELECT
        'oculto_play_items' AS origem,
        COUNT(*) FILTER (WHERE share_url ~ '^https://ocultoswing\.com\.br/play/p/.+\?v=2$') AS links_play_com_v2
      FROM public.oculto_play_items
    $sql$;
  ELSE
    INSERT INTO tmp_oculto_play_share_preview_report VALUES ('oculto_play_items_sem_share_url', 0);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'oculto_play_item_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'share_link'
  ) THEN
    EXECUTE $sql$
      INSERT INTO tmp_oculto_play_share_preview_report (origem, links_play_com_v2)
      SELECT
        'posts_oculto_play' AS origem,
        COUNT(*) FILTER (WHERE share_link ~ '^https://ocultoswing\.com\.br/play/p/.+\?v=2$') AS links_play_com_v2
      FROM public.posts
      WHERE oculto_play_item_id IS NOT NULL
    $sql$;
  ELSE
    INSERT INTO tmp_oculto_play_share_preview_report VALUES ('posts_sem_colunas_play_share', 0);
  END IF;
END $$;

SELECT * FROM tmp_oculto_play_share_preview_report;
