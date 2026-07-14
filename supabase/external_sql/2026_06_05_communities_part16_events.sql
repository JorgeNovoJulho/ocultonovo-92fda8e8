-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  Comunidades Ocultas — Parte 16 — Eventos (encontros / lives) ║
-- ║  Banco: rvybbrkzmboqbhcemqar (EXTERNO)                        ║
-- ║  Idempotente — pode rodar várias vezes.                       ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- 1) Tabela de eventos da comunidade
CREATE TABLE IF NOT EXISTS public.oculto_community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.oculto_community_channels(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_url text,
  location text,                -- presencial: cidade/local; online: link/plataforma
  event_kind text NOT NULL DEFAULT 'meetup' CHECK (event_kind IN ('meetup','live','call','party','other')),
  is_online boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  capacity int,                 -- null = sem limite
  going_count int NOT NULL DEFAULT 0,
  interested_count int NOT NULL DEFAULT 0,
  is_cancelled boolean NOT NULL DEFAULT false,
  is_adult boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_events TO authenticated;
GRANT ALL ON public.oculto_community_events TO service_role;

ALTER TABLE public.oculto_community_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_oce_community ON public.oculto_community_events(community_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_oce_channel ON public.oculto_community_events(channel_id);
CREATE INDEX IF NOT EXISTS idx_oce_upcoming ON public.oculto_community_events(starts_at) WHERE NOT is_cancelled;

-- 2) RSVPs (going / interested)
CREATE TABLE IF NOT EXISTS public.oculto_community_event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.oculto_community_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('going','interested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_event_rsvps TO authenticated;
GRANT ALL ON public.oculto_community_event_rsvps TO service_role;

ALTER TABLE public.oculto_community_event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ocer_event ON public.oculto_community_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_ocer_user ON public.oculto_community_event_rsvps(user_id);

-- 3) RLS — eventos visíveis para membros + master; RSVPs visíveis a todos os membros
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_community_events' AND policyname='oce_select_member') THEN
    CREATE POLICY oce_select_member ON public.oculto_community_events
    FOR SELECT TO authenticated USING (
      public.oculto_is_master(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.oculto_community_members m
        WHERE m.community_id = oculto_community_events.community_id
          AND m.user_id = auth.uid()
          AND m.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM public.oculto_communities c
        WHERE c.id = oculto_community_events.community_id AND c.visibility = 'public'
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_community_event_rsvps' AND policyname='ocer_select_member') THEN
    CREATE POLICY ocer_select_member ON public.oculto_community_event_rsvps
    FOR SELECT TO authenticated USING (
      public.oculto_is_master(auth.uid())
      OR user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.oculto_community_events e
        JOIN public.oculto_community_members m ON m.community_id = e.community_id
        WHERE e.id = oculto_community_event_rsvps.event_id
          AND m.user_id = auth.uid()
          AND m.status = 'active'
      )
    );
  END IF;
END $$;

-- 4) Trigger updated_at
CREATE OR REPLACE FUNCTION public._oce_touch_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oce_touch_updated ON public.oculto_community_events;
CREATE TRIGGER trg_oce_touch_updated
BEFORE UPDATE ON public.oculto_community_events
FOR EACH ROW EXECUTE FUNCTION public._oce_touch_updated();

-- 5) Recalc contadores
CREATE OR REPLACE FUNCTION public._oce_recount(_event uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.oculto_community_events e
  SET going_count = COALESCE((SELECT count(*) FROM public.oculto_community_event_rsvps WHERE event_id = e.id AND status='going'), 0),
      interested_count = COALESCE((SELECT count(*) FROM public.oculto_community_event_rsvps WHERE event_id = e.id AND status='interested'), 0)
  WHERE e.id = _event;
$$;

CREATE OR REPLACE FUNCTION public._oce_rsvp_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._oce_recount(COALESCE(NEW.event_id, OLD.event_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_oce_rsvp_after ON public.oculto_community_event_rsvps;
CREATE TRIGGER trg_oce_rsvp_after
AFTER INSERT OR UPDATE OR DELETE ON public.oculto_community_event_rsvps
FOR EACH ROW EXECUTE FUNCTION public._oce_rsvp_after();

-- 6) RPC: upsert evento (owner/mod/master)
CREATE OR REPLACE FUNCTION public.community_event_upsert(
  _community uuid,
  _id uuid,
  _title text,
  _description text,
  _cover_url text,
  _location text,
  _event_kind text,
  _is_online boolean,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _capacity int,
  _is_adult boolean,
  _channel_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF NOT public._community_can_moderate(v_uid, _community) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _title IS NULL OR length(btrim(_title)) < 2 THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF _starts_at IS NULL THEN
    RAISE EXCEPTION 'starts_at_required';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.oculto_community_events(
      community_id, channel_id, created_by, title, description, cover_url,
      location, event_kind, is_online, starts_at, ends_at, capacity, is_adult
    ) VALUES (
      _community, _channel_id, v_uid, btrim(_title), nullif(btrim(_description),''), _cover_url,
      nullif(btrim(_location),''), COALESCE(_event_kind,'meetup'), COALESCE(_is_online,false),
      _starts_at, _ends_at, _capacity, COALESCE(_is_adult,false)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.oculto_community_events
    SET title = btrim(_title),
        description = nullif(btrim(_description),''),
        cover_url = _cover_url,
        location = nullif(btrim(_location),''),
        event_kind = COALESCE(_event_kind, event_kind),
        is_online = COALESCE(_is_online, is_online),
        starts_at = _starts_at,
        ends_at = _ends_at,
        capacity = _capacity,
        is_adult = COALESCE(_is_adult, is_adult),
        channel_id = _channel_id
    WHERE id = _id AND community_id = _community
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  END IF;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.community_event_upsert(uuid,uuid,text,text,text,text,text,boolean,timestamptz,timestamptz,int,boolean,uuid) TO authenticated;

-- 7) RPC: cancelar evento
CREATE OR REPLACE FUNCTION public.community_event_cancel(_id uuid, _cancel boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comm uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT community_id INTO v_comm FROM public.oculto_community_events WHERE id = _id;
  IF v_comm IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public._community_can_moderate(v_uid, v_comm) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.oculto_community_events SET is_cancelled = COALESCE(_cancel,true) WHERE id = _id;
END $$;

GRANT EXECUTE ON FUNCTION public.community_event_cancel(uuid, boolean) TO authenticated;

-- 8) RPC: deletar evento
CREATE OR REPLACE FUNCTION public.community_event_delete(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comm uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT community_id INTO v_comm FROM public.oculto_community_events WHERE id = _id;
  IF v_comm IS NULL THEN RETURN; END IF;
  IF NOT public._community_can_moderate(v_uid, v_comm) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.oculto_community_events WHERE id = _id;
END $$;

GRANT EXECUTE ON FUNCTION public.community_event_delete(uuid) TO authenticated;

-- 9) RPC: RSVP (toggle going/interested/none)
CREATE OR REPLACE FUNCTION public.community_event_rsvp(_event uuid, _status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comm uuid;
  v_current text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _status NOT IN ('going','interested','none') THEN RAISE EXCEPTION 'bad_status'; END IF;

  SELECT community_id INTO v_comm FROM public.oculto_community_events WHERE id = _event AND NOT is_cancelled;
  IF v_comm IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  -- precisa ser membro ativo (ou master)
  IF NOT public.oculto_is_master(v_uid) AND NOT EXISTS (
    SELECT 1 FROM public.oculto_community_members
    WHERE community_id = v_comm AND user_id = v_uid AND status='active'
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  SELECT status INTO v_current FROM public.oculto_community_event_rsvps WHERE event_id = _event AND user_id = v_uid;

  IF _status = 'none' OR _status = COALESCE(v_current,'') THEN
    DELETE FROM public.oculto_community_event_rsvps WHERE event_id = _event AND user_id = v_uid;
    RETURN 'none';
  END IF;

  INSERT INTO public.oculto_community_event_rsvps(event_id, user_id, status)
  VALUES (_event, v_uid, _status)
  ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, created_at = now();
  RETURN _status;
END $$;

GRANT EXECUTE ON FUNCTION public.community_event_rsvp(uuid, text) TO authenticated;

-- 10) RPC helper: meus RSVPs por comunidade
CREATE OR REPLACE FUNCTION public.community_event_my_rsvps(_community uuid)
RETURNS TABLE(event_id uuid, status text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT r.event_id, r.status
  FROM public.oculto_community_event_rsvps r
  JOIN public.oculto_community_events e ON e.id = r.event_id
  WHERE e.community_id = _community AND r.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.community_event_my_rsvps(uuid) TO authenticated;

-- 11) Notificação: ao criar evento, notifica todos os membros ativos
CREATE OR REPLACE FUNCTION public._oce_notify_new_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_title text;
BEGIN
  SELECT title INTO v_community_title FROM public.oculto_communities WHERE id = NEW.community_id;
  INSERT INTO public.notifications(user_id, type, title, message, data, is_read)
  SELECT m.user_id,
         'community_event',
         'Novo evento em ' || COALESCE(v_community_title,'comunidade'),
         NEW.title,
         jsonb_build_object(
           'event_id', NEW.id,
           'community_id', NEW.community_id,
           'starts_at', NEW.starts_at,
           'url', '/comunidades/' || (SELECT slug FROM public.oculto_communities WHERE id = NEW.community_id)
         ),
         false
  FROM public.oculto_community_members m
  WHERE m.community_id = NEW.community_id
    AND m.status = 'active'
    AND m.user_id <> NEW.created_by
    AND COALESCE(m.notify_level,'all') <> 'mute';
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oce_notify_new ON public.oculto_community_events;
CREATE TRIGGER trg_oce_notify_new
AFTER INSERT ON public.oculto_community_events
FOR EACH ROW EXECUTE FUNCTION public._oce_notify_new_event();

NOTIFY pgrst, 'reload schema';
