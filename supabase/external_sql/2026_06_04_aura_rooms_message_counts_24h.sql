-- Contador de mensagens (últimas 24h) por sala oculta. Idempotente.
CREATE OR REPLACE FUNCTION public.aura_rooms_message_counts_24h()
RETURNS TABLE(room_slug text, count_24h integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.room_slug::text, COUNT(*)::int AS count_24h
    FROM public.oculto_aura_room_messages m
   WHERE m.created_at >= now() - interval '24 hours'
   GROUP BY m.room_slug;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_message_counts_24h()
  TO anon, authenticated, service_role;

ALTER TABLE public.oculto_aura_room_messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND tablename='oculto_aura_room_messages';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_messages';
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
