-- =====================================================================
-- Aura Match — Master admin bypass + Tema Livre aberta + Waitlist por sala cheia
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Capacidade por sala + flag "aberta a todos" -----------------------
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS max_capacity smallint NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS open_to_all  boolean  NOT NULL DEFAULT false;

UPDATE public.oculto_aura_rooms
   SET open_to_all = true,
       max_capacity = 20
 WHERE slug = 'tema-livre';

-- 2) Tabelas de waitlist + slot offers --------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_aura_room_waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug   text NOT NULL REFERENCES public.oculto_aura_rooms(slug) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_slug, user_id)
);
CREATE INDEX IF NOT EXISTS idx_aura_waitlist_room_order
  ON public.oculto_aura_room_waitlist (room_slug, enqueued_at);

ALTER TABLE public.oculto_aura_room_waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wl_read"  ON public.oculto_aura_room_waitlist;
DROP POLICY IF EXISTS "wl_self_del" ON public.oculto_aura_room_waitlist;
CREATE POLICY "wl_read"     ON public.oculto_aura_room_waitlist FOR SELECT TO authenticated USING (true);
CREATE POLICY "wl_self_del" ON public.oculto_aura_room_waitlist FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.oculto_aura_room_slot_offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug   text NOT NULL REFERENCES public.oculto_aura_rooms(slug) ON DELETE CASCADE,
  room_name   text,
  hue         smallint,
  user_id     uuid NOT NULL,
  offered_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '60 seconds',
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','ignored','expired'))
);
CREATE INDEX IF NOT EXISTS idx_aura_slot_offers_user
  ON public.oculto_aura_room_slot_offers (user_id, status, offered_at DESC);

ALTER TABLE public.oculto_aura_room_slot_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "slot_offers_read_own" ON public.oculto_aura_room_slot_offers;
CREATE POLICY "slot_offers_read_own"
  ON public.oculto_aura_room_slot_offers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_slot_offers;

-- 3) Helper: é master admin? ------------------------------------------
CREATE OR REPLACE FUNCTION public._aura_is_master(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean := false;
BEGIN
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = p_user AND role::text = 'admin_master'
    ) INTO v;
  EXCEPTION WHEN undefined_table THEN v := false; END;

  IF NOT v THEN
    -- Fallback por email do master
    SELECT EXISTS (
      SELECT 1 FROM auth.users
       WHERE id = p_user AND lower(email) = 'ocultomaster@ocultoswing.com.br'
    ) INTO v;
  END IF;
  RETURN COALESCE(v, false);
END;
$$;
GRANT EXECUTE ON FUNCTION public._aura_is_master(uuid) TO authenticated;

-- 4) Sobrescreve _aura_room_check_gates para honrar master + open_to_all
CREATE OR REPLACE FUNCTION public._aura_room_check_gates(p_slug text, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.oculto_aura_rooms;
  v_plan text;
  v_kyc  boolean;
  v_couple boolean;
  v_aura_lvl smallint := 0;
  v_score int := 0;
  v_xp int := 0;
  v_reason text := NULL;
BEGIN
  SELECT * INTO r FROM public.oculto_aura_rooms WHERE slug = p_slug AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false, 'observer', false, 'reason', 'room_not_found'); END IF;

  -- Master admin: passa por tudo
  IF public._aura_is_master(p_user) THEN
    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'master', true);
  END IF;

  -- Sala "aberta a todos" (ex.: Tema Livre)
  IF COALESCE(r.open_to_all, false) THEN
    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null);
  END IF;

  SELECT lower(coalesce(plan_type,'free')),
         coalesce(document_verified,false),
         (lower(coalesce(profile_type,'')) IN ('couple','casal'))
    INTO v_plan, v_kyc, v_couple
    FROM public.profiles WHERE user_id = p_user;

  BEGIN
    SELECT coalesce(total_score,0), coalesce(total_xp,0)
      INTO v_score, v_xp
      FROM public.oculto_social_scores WHERE user_id = p_user;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    SELECT coalesce(level,0) INTO v_aura_lvl FROM public.aura_progress WHERE user_id = p_user;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  IF r.required_plan = 'vip'     AND v_plan NOT LIKE '%vip%'    THEN v_reason := 'plan_vip_required'; END IF;
  IF r.required_plan = 'premium' AND v_plan = 'free'            THEN v_reason := 'plan_premium_required'; END IF;
  IF r.requires_kyc AND NOT v_kyc                                THEN v_reason := 'kyc_required'; END IF;
  IF r.couple_only AND NOT v_couple                              THEN v_reason := 'couple_only'; END IF;
  IF v_aura_lvl < r.min_aura_level                               THEN v_reason := 'aura_level_low'; END IF;
  IF v_score    < r.min_social_score                             THEN v_reason := 'social_score_low'; END IF;
  IF v_xp       < r.min_prestige_xp                              THEN v_reason := 'prestige_low'; END IF;

  RETURN jsonb_build_object('allowed', v_reason IS NULL, 'observer', v_reason IS NOT NULL, 'reason', v_reason);
END;
$$;
GRANT EXECUTE ON FUNCTION public._aura_room_check_gates(text, uuid) TO authenticated;

-- 5) JOIN com capacidade + waitlist -----------------------------------
CREATE OR REPLACE FUNCTION public.aura_room_join(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_check jsonb;
  v_obs boolean;
  v_count int;
  v_cap int;
  v_master boolean;
  v_pos int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason','no_auth'); END IF;
  v_master := public._aura_is_master(v_uid);
  v_check := public._aura_room_check_gates(p_slug, v_uid);
  v_obs := NOT (v_check->>'allowed')::boolean;

  SELECT max_capacity INTO v_cap FROM public.oculto_aura_rooms WHERE slug = p_slug;
  v_cap := COALESCE(v_cap, 12);

  -- Master: ignora capacidade
  IF v_master THEN
    INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
    VALUES (p_slug, v_uid, false, now())
    ON CONFLICT (room_slug, user_id) DO UPDATE SET last_ping = now(), is_observer = false;
    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'master', true);
  END IF;

  -- Conta presentes ativos (last_ping < 2min) que NÃO são observadores
  SELECT count(*) INTO v_count
    FROM public.oculto_aura_room_presence
   WHERE room_slug = p_slug
     AND last_ping > now() - interval '2 minutes'
     AND is_observer = false;

  -- Sala cheia + não observador → entra na waitlist
  IF v_count >= v_cap AND NOT v_obs THEN
    INSERT INTO public.oculto_aura_room_waitlist(room_slug, user_id)
    VALUES (p_slug, v_uid)
    ON CONFLICT (room_slug, user_id) DO NOTHING;

    SELECT count(*) INTO v_pos
      FROM public.oculto_aura_room_waitlist
     WHERE room_slug = p_slug
       AND enqueued_at <= COALESCE(
         (SELECT enqueued_at FROM public.oculto_aura_room_waitlist
            WHERE room_slug = p_slug AND user_id = v_uid),
         now());

    RETURN jsonb_build_object(
      'allowed', false, 'observer', false, 'reason', 'room_full',
      'queued', true, 'position', v_pos, 'capacity', v_cap
    );
  END IF;

  INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
  VALUES (p_slug, v_uid, v_obs, now())
  ON CONFLICT (room_slug, user_id) DO UPDATE
    SET last_ping = now(), is_observer = EXCLUDED.is_observer;

  RETURN v_check;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_join(text) TO authenticated;

-- 6) LEAVE: remove + promove o próximo da fila ------------------------
CREATE OR REPLACE FUNCTION public.aura_room_leave(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_next uuid;
  v_room public.oculto_aura_rooms;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

  DELETE FROM public.oculto_aura_room_presence
   WHERE room_slug = p_slug AND user_id = v_uid;

  -- também tira da fila se estava esperando
  DELETE FROM public.oculto_aura_room_waitlist
   WHERE room_slug = p_slug AND user_id = v_uid;

  SELECT * INTO v_room FROM public.oculto_aura_rooms WHERE slug = p_slug;

  -- Promove o próximo da fila criando uma slot offer (60s)
  SELECT user_id INTO v_next
    FROM public.oculto_aura_room_waitlist
   WHERE room_slug = p_slug
   ORDER BY enqueued_at ASC
   LIMIT 1;

  IF v_next IS NOT NULL THEN
    INSERT INTO public.oculto_aura_room_slot_offers(room_slug, room_name, hue, user_id)
    VALUES (p_slug, v_room.name, v_room.hue, v_next);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_leave(text) TO authenticated;

-- 7) RPCs de waitlist consumidas pelo frontend ------------------------
CREATE OR REPLACE FUNCTION public.aura_room_waitlist_pending_offer()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT id, room_slug, room_name, hue, offered_at, expires_at
    INTO r
    FROM public.oculto_aura_room_slot_offers
   WHERE user_id = auth.uid()
     AND status = 'pending'
     AND expires_at > now()
   ORDER BY offered_at DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  RETURN to_jsonb(r);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_waitlist_pending_offer() TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_room_waitlist_accept(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offer record;
BEGIN
  SELECT * INTO v_offer FROM public.oculto_aura_room_slot_offers
   WHERE id = p_offer_id AND user_id = auth.uid();
  IF NOT FOUND OR v_offer.status <> 'pending' OR v_offer.expires_at <= now() THEN
    UPDATE public.oculto_aura_room_slot_offers SET status = 'expired' WHERE id = p_offer_id;
    DELETE FROM public.oculto_aura_room_waitlist
     WHERE room_slug = v_offer.room_slug AND user_id = auth.uid();
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  UPDATE public.oculto_aura_room_slot_offers SET status = 'accepted' WHERE id = p_offer_id;
  DELETE FROM public.oculto_aura_room_waitlist
   WHERE room_slug = v_offer.room_slug AND user_id = auth.uid();

  INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
  VALUES (v_offer.room_slug, auth.uid(), false, now())
  ON CONFLICT (room_slug, user_id) DO UPDATE SET last_ping = now(), is_observer = false;

  RETURN jsonb_build_object('ok', true, 'room_slug', v_offer.room_slug);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_waitlist_accept(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.aura_room_waitlist_ignore(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offer record;
BEGIN
  SELECT * INTO v_offer FROM public.oculto_aura_room_slot_offers
   WHERE id = p_offer_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  UPDATE public.oculto_aura_room_slot_offers SET status = 'ignored' WHERE id = p_offer_id;
  DELETE FROM public.oculto_aura_room_waitlist
   WHERE room_slug = v_offer.room_slug AND user_id = auth.uid();

  -- Promove próximo da fila
  DECLARE v_next uuid; v_room public.oculto_aura_rooms;
  BEGIN
    SELECT * INTO v_room FROM public.oculto_aura_rooms WHERE slug = v_offer.room_slug;
    SELECT user_id INTO v_next FROM public.oculto_aura_room_waitlist
     WHERE room_slug = v_offer.room_slug
     ORDER BY enqueued_at ASC LIMIT 1;
    IF v_next IS NOT NULL THEN
      INSERT INTO public.oculto_aura_room_slot_offers(room_slug, room_name, hue, user_id)
      VALUES (v_offer.room_slug, v_room.name, v_room.hue, v_next);
    END IF;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_waitlist_ignore(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
