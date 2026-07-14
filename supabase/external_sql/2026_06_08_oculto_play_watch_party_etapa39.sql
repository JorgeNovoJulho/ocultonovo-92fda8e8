-- ============================================================================
-- OCULTO PLAY — Etapa 39: Watch Party síncrona (assistir junto)
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Idempotente: pode rodar mais de uma vez.
--
-- Escopo:
--   • Salas leves onde o host controla play/pause/seek/troca de item.
--   • Guests entram por link e seguem o estado em realtime.
--   • Não armazena chat — chat fica fora do MVP (pode plugar depois).
-- ============================================================================

-- 1) Salas
CREATE TABLE IF NOT EXISTS public.oculto_play_watch_parties (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_item_id     uuid NULL,
  current_pos_seconds numeric(10,3) NOT NULL DEFAULT 0,
  is_playing          boolean NOT NULL DEFAULT true,
  title               text NULL,
  status              text NOT NULL DEFAULT 'live' CHECK (status IN ('live','ended')),
  participant_count   integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_watch_parties_host
  ON public.oculto_play_watch_parties (host_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_parties_status
  ON public.oculto_play_watch_parties (status, created_at DESC);

-- 2) Participantes
CREATE TABLE IF NOT EXISTS public.oculto_play_watch_party_participants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id     uuid NOT NULL REFERENCES public.oculto_play_watch_parties(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_party_participants_party
  ON public.oculto_play_watch_party_participants (party_id, last_seen_at DESC);

-- 3) Grants e RLS
GRANT SELECT, INSERT, UPDATE ON public.oculto_play_watch_parties TO authenticated;
GRANT ALL ON public.oculto_play_watch_parties TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_watch_party_participants TO authenticated;
GRANT ALL ON public.oculto_play_watch_party_participants TO service_role;

ALTER TABLE public.oculto_play_watch_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_play_watch_party_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wp_read_all" ON public.oculto_play_watch_parties;
CREATE POLICY "wp_read_all"
ON public.oculto_play_watch_parties
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "wp_insert_self_host" ON public.oculto_play_watch_parties;
CREATE POLICY "wp_insert_self_host"
ON public.oculto_play_watch_parties
FOR INSERT TO authenticated
WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS "wp_update_host" ON public.oculto_play_watch_parties;
CREATE POLICY "wp_update_host"
ON public.oculto_play_watch_parties
FOR UPDATE TO authenticated
USING (host_user_id = auth.uid())
WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS "wpp_read_all" ON public.oculto_play_watch_party_participants;
CREATE POLICY "wpp_read_all"
ON public.oculto_play_watch_party_participants
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "wpp_insert_self" ON public.oculto_play_watch_party_participants;
CREATE POLICY "wpp_insert_self"
ON public.oculto_play_watch_party_participants
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "wpp_update_self" ON public.oculto_play_watch_party_participants;
CREATE POLICY "wpp_update_self"
ON public.oculto_play_watch_party_participants
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "wpp_delete_self" ON public.oculto_play_watch_party_participants;
CREATE POLICY "wpp_delete_self"
ON public.oculto_play_watch_party_participants
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- 4) RPCs
CREATE OR REPLACE FUNCTION public.watch_party_create(
  _item_id uuid,
  _title   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  INSERT INTO public.oculto_play_watch_parties(host_user_id, current_item_id, title)
  VALUES (auth.uid(), _item_id, _title)
  RETURNING id INTO _id;

  INSERT INTO public.oculto_play_watch_party_participants(party_id, user_id)
  VALUES (_id, auth.uid())
  ON CONFLICT (party_id, user_id) DO NOTHING;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.watch_party_join(_party_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  INSERT INTO public.oculto_play_watch_party_participants(party_id, user_id)
  VALUES (_party_id, auth.uid())
  ON CONFLICT (party_id, user_id) DO UPDATE SET last_seen_at = now();

  UPDATE public.oculto_play_watch_parties
     SET participant_count = (
           SELECT COUNT(*) FROM public.oculto_play_watch_party_participants
            WHERE party_id = _party_id
         ),
         updated_at = now()
   WHERE id = _party_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.watch_party_update_state(
  _party_id uuid,
  _item_id  uuid,
  _pos      numeric,
  _playing  boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  UPDATE public.oculto_play_watch_parties
     SET current_item_id     = COALESCE(_item_id, current_item_id),
         current_pos_seconds = GREATEST(0, COALESCE(_pos, current_pos_seconds)),
         is_playing          = COALESCE(_playing, is_playing),
         updated_at          = now()
   WHERE id = _party_id
     AND host_user_id = auth.uid()
     AND status = 'live';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.watch_party_end(_party_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  UPDATE public.oculto_play_watch_parties
     SET status = 'ended', ended_at = now(), updated_at = now()
   WHERE id = _party_id AND host_user_id = auth.uid();

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.watch_party_create(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.watch_party_join(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.watch_party_update_state(uuid, uuid, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.watch_party_end(uuid) TO authenticated;

-- 5) Realtime
ALTER TABLE public.oculto_play_watch_parties REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_play_watch_party_participants REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_watch_parties;
  EXCEPTION WHEN duplicate_object THEN NULL;
           WHEN undefined_object THEN
             CREATE PUBLICATION supabase_realtime;
             ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_watch_parties;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_watch_party_participants;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;

NOTIFY pgrst, 'reload schema';
