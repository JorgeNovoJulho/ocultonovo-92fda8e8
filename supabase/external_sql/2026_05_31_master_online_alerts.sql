-- ============================================================
-- ADMIN MASTER · Alerta automático de usuários online + presente XP por usuário
-- Idempotente — pode ser executado várias vezes no SQL Editor do Supabase EXTERNO
-- (rvybbrkzmboqbhcemqar). Não toca nada existente fora deste escopo.
-- ============================================================

-- ---------- 1) Singleton de configuração do alerta master ----------
CREATE TABLE IF NOT EXISTS public.oculto_master_alert_settings (
  id                  text PRIMARY KEY DEFAULT 'singleton',
  enabled             boolean NOT NULL DEFAULT true,
  sound_preset        text    NOT NULL DEFAULT 'bell',         -- bell|chime|ping|custom
  sound_url           text,                                     -- URL do som customizado
  volume              numeric(3,2) NOT NULL DEFAULT 0.80,       -- 0.00 a 1.00
  recurrence_seconds  integer NOT NULL DEFAULT 60,              -- intervalo mínimo entre alertas
  auto_open_modal     boolean NOT NULL DEFAULT true,
  last_triggered_at   timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oculto_master_alert_settings_singleton CHECK (id = 'singleton')
);

GRANT SELECT, INSERT, UPDATE ON public.oculto_master_alert_settings TO authenticated;
GRANT ALL ON public.oculto_master_alert_settings TO service_role;

ALTER TABLE public.oculto_master_alert_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='oculto_master_alert_settings'
      AND policyname='master_can_read_alert_settings'
  ) THEN
    CREATE POLICY master_can_read_alert_settings
      ON public.oculto_master_alert_settings FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE (p.id = auth.uid() OR p.user_id = auth.uid())
            AND lower(p.username) = 'ocultomaster'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='oculto_master_alert_settings'
      AND policyname='master_can_upsert_alert_settings'
  ) THEN
    CREATE POLICY master_can_upsert_alert_settings
      ON public.oculto_master_alert_settings FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE (p.id = auth.uid() OR p.user_id = auth.uid())
            AND lower(p.username) = 'ocultomaster'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='oculto_master_alert_settings'
      AND policyname='master_can_update_alert_settings'
  ) THEN
    CREATE POLICY master_can_update_alert_settings
      ON public.oculto_master_alert_settings FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE (p.id = auth.uid() OR p.user_id = auth.uid())
            AND lower(p.username) = 'ocultomaster'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE (p.id = auth.uid() OR p.user_id = auth.uid())
            AND lower(p.username) = 'ocultomaster'
        )
      );
  END IF;
END $$;

-- Garante uma linha singleton
INSERT INTO public.oculto_master_alert_settings (id)
VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

-- Realtime para a config (caso o master mude num device e queira refletir em outro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename='oculto_master_alert_settings'
  ) THEN
    EXECUTE 'ALTER TABLE public.oculto_master_alert_settings REPLICA IDENTITY FULL';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_master_alert_settings';
  END IF;
END $$;

-- ---------- 2) Bucket privado para sons customizados ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('master-alerts', 'master-alerts', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='master_can_read_master_alert_sounds'
  ) THEN
    CREATE POLICY master_can_read_master_alert_sounds
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'master-alerts'
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE (p.id = auth.uid() OR p.user_id = auth.uid())
            AND lower(p.username) = 'ocultomaster'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='master_can_upload_master_alert_sounds'
  ) THEN
    CREATE POLICY master_can_upload_master_alert_sounds
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'master-alerts'
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE (p.id = auth.uid() OR p.user_id = auth.uid())
            AND lower(p.username) = 'ocultomaster'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='master_can_delete_master_alert_sounds'
  ) THEN
    CREATE POLICY master_can_delete_master_alert_sounds
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'master-alerts'
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE (p.id = auth.uid() OR p.user_id = auth.uid())
            AND lower(p.username) = 'ocultomaster'
        )
      );
  END IF;
END $$;

-- ---------- 3) RPC: lista de usuários online com flag de já presenteado pelo master ----------
CREATE OR REPLACE FUNCTION public.master_online_unrewarded_get()
RETURNS TABLE (
  profile_id     uuid,
  user_id        uuid,
  username       text,
  name           text,
  avatar_url     text,
  plan_type      text,
  aura_level     integer,
  last_seen      timestamptz,
  already_gifted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_sender_profile   uuid;
  v_sender_username  text;
  v_five_min_ago     timestamptz := now() - interval '5 minutes';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT p.id, lower(COALESCE(p.username,''))
    INTO v_sender_profile, v_sender_username
    FROM public.profiles p
   WHERE (p.id = v_uid OR p.user_id = v_uid)
   LIMIT 1;

  IF v_sender_profile IS NULL OR v_sender_username <> 'ocultomaster' THEN
    RAISE EXCEPTION 'master only';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                                          AS profile_id,
    p.user_id                                                     AS user_id,
    p.username                                                    AS username,
    p.name                                                        AS name,
    p.avatar_url                                                  AS avatar_url,
    p.plan_type                                                   AS plan_type,
    p.aura_level                                                  AS aura_level,
    p.last_seen                                                   AS last_seen,
    EXISTS (
      SELECT 1 FROM public.oculto_aura_xp_gifts g
       WHERE g.sender_id   = v_uid
         AND g.receiver_id = p.id
    )                                                             AS already_gifted
  FROM public.profiles p
  WHERE p.is_online   = true
    AND p.last_seen  >= v_five_min_ago
    AND COALESCE(p.is_seed, false) = false
    AND p.banned_at IS NULL
    AND p.id <> v_sender_profile
  ORDER BY p.last_seen DESC
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.master_online_unrewarded_get() FROM public;
GRANT EXECUTE ON FUNCTION public.master_online_unrewarded_get() TO authenticated;

-- ---------- 4) RPC: presentear UM usuário (com proteção anti-duplicidade) ----------
CREATE OR REPLACE FUNCTION public.admin_master_gift_single_xp(
  p_receiver_profile_id uuid,
  p_amount integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_sender_profile   uuid;
  v_sender_username  text;
  v_sender_display   text;
  v_receiver_user_id uuid;
  v_gift_id          uuid;
  v_already          boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'amount must be between 1 and 10000';
  END IF;
  IF p_receiver_profile_id IS NULL THEN
    RAISE EXCEPTION 'receiver required';
  END IF;

  SELECT p.id,
         lower(COALESCE(p.username,'')),
         COALESCE(NULLIF(p.name,''), NULLIF(p.username,''), 'Oculto Master')
    INTO v_sender_profile, v_sender_username, v_sender_display
    FROM public.profiles p
   WHERE (p.id = v_uid OR p.user_id = v_uid)
   LIMIT 1;

  IF v_sender_profile IS NULL OR v_sender_username <> 'ocultomaster' THEN
    RAISE EXCEPTION 'master only';
  END IF;

  -- já presenteou?
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_aura_xp_gifts
     WHERE sender_id = v_uid AND receiver_id = p_receiver_profile_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'already_gifted', true);
  END IF;

  SELECT user_id INTO v_receiver_user_id
    FROM public.profiles WHERE id = p_receiver_profile_id LIMIT 1;

  -- crédito de XP
  BEGIN
    UPDATE public.profiles
       SET aura_xp    = COALESCE(aura_xp, 0) + p_amount,
           aura_level = COALESCE(public.aura_level_from_xp(COALESCE(aura_xp,0) + p_amount), aura_level)
     WHERE id = p_receiver_profile_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.profiles
       SET aura_xp = COALESCE(aura_xp, 0) + p_amount
     WHERE id = p_receiver_profile_id;
  END;

  -- registro do presente (dispara realtime → useGiftNotifications)
  INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount)
  VALUES (v_uid, p_receiver_profile_id, p_amount)
  RETURNING id INTO v_gift_id;

  -- notificação redundante
  IF v_receiver_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
      VALUES (
        v_receiver_user_id,
        'gift_received',
        '@' || COALESCE(v_sender_username, 'ocultomaster') || ' te enviou ' || p_amount || ' XP',
        NULL,
        jsonb_build_object(
          'from_user_id',      v_uid,
          'sender_profile_id', v_sender_profile,
          'sender_username',   v_sender_username,
          'sender_display',    v_sender_display,
          'amount',            p_amount,
          'gift_id',           v_gift_id,
          'source',            'admin_master_single_online_gift'
        ),
        false
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',       true,
    'gift_id',  v_gift_id,
    'amount',   p_amount,
    'receiver', p_receiver_profile_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_master_gift_single_xp(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_master_gift_single_xp(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
