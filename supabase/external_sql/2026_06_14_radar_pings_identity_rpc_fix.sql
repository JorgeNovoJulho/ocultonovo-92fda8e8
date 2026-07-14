-- =====================================================================
-- Radar Pings — correção definitiva de identidade (profiles.id x auth.uid)
-- Cole no SQL Editor do Supabase EXTERNO.
--
-- Corrige:
--   • Radar envia profiles.id, mas algumas policies/fluxos usavam auth.uid().
--   • Acenos antigos gravados com profile.id OU user_id passam a aparecer.
--   • Realtime garantido em pings e notifications.
--   • RPC send_radar_ping resolve destino por profile.id, user_id ou username.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','seen')),
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NULL,
  CONSTRAINT pings_no_self CHECK (sender_id <> receiver_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pings_active_unique
  ON public.pings (sender_id, receiver_id)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS pings_receiver_created_idx
  ON public.pings (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pings_sender_created_idx
  ON public.pings (sender_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pings TO authenticated;
GRANT ALL ON public.pings TO service_role;

ALTER TABLE public.pings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pings_select_involved" ON public.pings;
CREATE POLICY "pings_select_involved" ON public.pings
  FOR SELECT TO authenticated
  USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (p.id = pings.sender_id OR p.id = pings.receiver_id)
    )
  );

DROP POLICY IF EXISTS "pings_insert_self_sender" ON public.pings;
CREATE POLICY "pings_insert_self_sender" ON public.pings
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id <> receiver_id
    AND (
      auth.uid() = sender_id
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND p.id = pings.sender_id
      )
    )
  );

DROP POLICY IF EXISTS "pings_update_receiver_seen" ON public.pings;
CREATE POLICY "pings_update_receiver_seen" ON public.pings
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = receiver_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.id = pings.receiver_id
    )
  )
  WITH CHECK (
    auth.uid() = receiver_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.id = pings.receiver_id
    )
  );

DROP POLICY IF EXISTS "pings_delete_sender" ON public.pings;
CREATE POLICY "pings_delete_sender" ON public.pings
  FOR DELETE TO authenticated
  USING (
    auth.uid() = sender_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.id = pings.sender_id
    )
  );

CREATE OR REPLACE FUNCTION public.send_radar_ping(p_target text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_profile_id uuid;
  v_sender_user_id uuid := auth.uid();
  v_sender_username text;
  v_target_profile_id uuid;
  v_target_user_id uuid;
  v_title text;
  v_body text;
BEGIN
  IF v_sender_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT p.id, p.username
    INTO v_sender_profile_id, v_sender_username
  FROM public.profiles p
  WHERE p.user_id = v_sender_user_id OR p.id = v_sender_user_id
  ORDER BY (p.user_id = v_sender_user_id) DESC, p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_sender_profile_id IS NULL THEN
    RAISE EXCEPTION 'sender_profile_not_found';
  END IF;

  SELECT p.id, p.user_id
    INTO v_target_profile_id, v_target_user_id
  FROM public.profiles p
  WHERE p.id::text = p_target
     OR p.user_id::text = p_target
     OR lower(p.username) = lower(p_target)
  ORDER BY (p.id::text = p_target) DESC, (p.user_id::text = p_target) DESC, p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_target_profile_id IS NULL THEN
    RAISE EXCEPTION 'target_profile_not_found';
  END IF;

  IF v_target_profile_id = v_sender_profile_id OR v_target_user_id = v_sender_user_id THEN
    RAISE EXCEPTION 'cannot_ping_self';
  END IF;

  BEGIN
    DELETE FROM public.pings
     WHERE sender_id = v_sender_profile_id
       AND receiver_id = v_target_profile_id
       AND status = 'sent';

    INSERT INTO public.pings (sender_id, receiver_id, status)
    VALUES (v_sender_profile_id, v_target_profile_id, 'sent')
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN foreign_key_violation THEN
    DELETE FROM public.pings
     WHERE sender_id = v_sender_user_id
       AND receiver_id = v_target_user_id
       AND status = 'sent';

    INSERT INTO public.pings (sender_id, receiver_id, status)
    VALUES (v_sender_user_id, v_target_user_id, 'sent')
    ON CONFLICT DO NOTHING;
  END;

  v_title := '👋 ' || COALESCE('@' || NULLIF(v_sender_username, ''), 'Alguém') || ' te acenou';
  v_body := COALESCE('@' || NULLIF(v_sender_username, ''), 'Alguém') || ' acenou para você pelo Radar.';

  INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
  VALUES (
    v_target_user_id,
    'looking_now',
    v_title,
    v_body,
    jsonb_build_object(
      'sender_id', v_sender_user_id,
      'sender_profile_id', v_sender_profile_id,
      'sender_username', v_sender_username
    ),
    false
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'sender_profile_id', v_sender_profile_id,
    'receiver_profile_id', v_target_profile_id,
    'receiver_user_id', v_target_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_radar_ping(text) TO authenticated;

ALTER TABLE public.pings REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pings;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
      CREATE PUBLICATION supabase_realtime;
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pings;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
