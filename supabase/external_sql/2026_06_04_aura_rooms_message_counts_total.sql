-- Contador de mensagens TOTAL (todo o histórico) por sala oculta.
-- Substitui a versão de 24h. Idempotente.

CREATE OR REPLACE FUNCTION public.aura_rooms_message_counts_24h()
RETURNS TABLE(room_slug text, count_24h integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Mantém o nome para compatibilidade do client, mas agora retorna o TOTAL histórico.
  SELECT m.room_slug::text, COUNT(*)::int AS count_24h
    FROM public.oculto_aura_room_messages m
   GROUP BY m.room_slug;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_message_counts_24h()
  TO anon, authenticated, service_role;

-- Alias com nome semanticamente correto, para uso futuro.
CREATE OR REPLACE FUNCTION public.aura_rooms_message_counts_total()
RETURNS TABLE(room_slug text, count_total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.room_slug::text, COUNT(*)::int AS count_total
    FROM public.oculto_aura_room_messages m
   GROUP BY m.room_slug;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_message_counts_total()
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
