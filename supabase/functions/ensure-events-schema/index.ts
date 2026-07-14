import postgres from "https://esm.sh/postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const databaseUrl = Deno.env.get("EXTERNAL_SUPABASE_DB_URL");
  if (!databaseUrl) {
    return new Response(JSON.stringify({ ok: false, error: "EXTERNAL_SUPABASE_DB_URL não configurado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS public.events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        creator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
        title text NOT NULL,
        description text,
        location text NOT NULL,
        event_date date NOT NULL,
        event_time time NOT NULL,
        image_url text,
        max_attendees integer,
        price text,
        tags text[],
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.event_rsvps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
        user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
        mute_notifications boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        UNIQUE(event_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS public.event_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
        sender_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
        content text NOT NULL,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.event_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
        sender_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
        recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
        status text DEFAULT 'pending',
        message text,
        created_at timestamptz DEFAULT now(),
        responded_at timestamptz
      );

      CREATE INDEX IF NOT EXISTS idx_events_creator_id ON public.events(creator_id);
      CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events(event_date);
      CREATE INDEX IF NOT EXISTS idx_events_is_active ON public.events(is_active);
      CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_id ON public.event_rsvps(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_id ON public.event_rsvps(user_id);
      CREATE INDEX IF NOT EXISTS idx_event_messages_event_id ON public.event_messages(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_invites_event_id ON public.event_invites(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_invites_recipient_id ON public.event_invites(recipient_id);

      ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.event_messages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='events_select_active_authenticated') THEN
          CREATE POLICY events_select_active_authenticated ON public.events FOR SELECT TO authenticated USING (is_active = true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='events_insert_vip_creator') THEN
          CREATE POLICY events_insert_vip_creator ON public.events FOR INSERT TO authenticated WITH CHECK (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = creator_id AND user_id = auth.uid() AND plan_type = 'vip')
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='events_update_creator') THEN
          CREATE POLICY events_update_creator ON public.events FOR UPDATE TO authenticated USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = events.creator_id AND user_id = auth.uid())
          ) WITH CHECK (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = events.creator_id AND user_id = auth.uid())
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='events_delete_creator') THEN
          CREATE POLICY events_delete_creator ON public.events FOR DELETE TO authenticated USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = events.creator_id AND user_id = auth.uid())
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_rsvps' AND policyname='event_rsvps_select_authenticated') THEN
          CREATE POLICY event_rsvps_select_authenticated ON public.event_rsvps FOR SELECT TO authenticated USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_rsvps' AND policyname='event_rsvps_insert_own') THEN
          CREATE POLICY event_rsvps_insert_own ON public.event_rsvps FOR INSERT TO authenticated WITH CHECK (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = event_rsvps.user_id AND user_id = auth.uid())
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_rsvps' AND policyname='event_rsvps_delete_own') THEN
          CREATE POLICY event_rsvps_delete_own ON public.event_rsvps FOR DELETE TO authenticated USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = event_rsvps.user_id AND user_id = auth.uid())
          );
        END IF;
      END $$;

      NOTIFY pgrst, 'reload schema';
    `);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
});
