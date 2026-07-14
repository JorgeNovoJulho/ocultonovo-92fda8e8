-- 2026_06_15 — OCULTO PLAY: força recache social do Facebook/WhatsApp/Telegram/X
-- Bump dos share_links persistidos de ?v=2 para ?v=3 para que crawlers
-- refaçam o scrape após o deploy que estabilizou /api/og-play-image
-- (antes desse deploy o endpoint caía no SPA HTML, fazendo Facebook
-- cachear "Propriedade inferida" sem capa).
-- 100% idempotente. Executar no SQL Editor do Supabase EXTERNO.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='oculto_play_items' AND column_name='share_url'
  ) THEN
    UPDATE public.oculto_play_items
    SET share_url = 'https://ocultoswing.com.br/play/p/' || id::text || '?v=3',
        updated_at = now()
    WHERE share_url IS NULL
       OR share_url ~ '^https?://(www\.)?ocultoswing\.com\.br/play/(p|share)/';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='share_link'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='oculto_play_item_id'
  ) THEN
    UPDATE public.posts
    SET share_link = 'https://ocultoswing.com.br/play/p/' || oculto_play_item_id::text || '?v=3',
        updated_at = now()
    WHERE oculto_play_item_id IS NOT NULL
      AND (share_link IS NULL OR share_link ~ 'ocultoswing\.com\.br/play/');
  END IF;
END $$;
