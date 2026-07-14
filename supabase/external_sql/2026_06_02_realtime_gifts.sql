-- =============================================================
-- Habilita Realtime para o modal "Presente Recebido" em mobile.
-- Idempotente: usa DO blocks para evitar erro "table already in
-- publication" caso já tenha sido aplicado anteriormente.
-- =============================================================

-- 1) oculto_aura_xp_gifts — fonte principal (canal direto do hook)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_aura_xp_gifts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_xp_gifts';
  END IF;
END $$;

-- 2) notifications — canal secundário (tipos: tip_received, gift, gift_received, unlock)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;

-- 3) Garante REPLICA IDENTITY FULL para que o payload do INSERT/UPDATE
--    inclua todas as colunas (necessário para filtrar receiver_id no client).
ALTER TABLE public.oculto_aura_xp_gifts REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
