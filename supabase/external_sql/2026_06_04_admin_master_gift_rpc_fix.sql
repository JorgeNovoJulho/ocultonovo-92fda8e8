-- =====================================================================
-- admin_master_gift_single_xp — revisão 2026-06-04
-- Aceita master por username 'ocultomaster' OU 'oculto_master' (normalizado)
-- e também por role admin_master no user_roles. Receptor pode vir como
-- profile.id, profile.user_id ou auth.users.id (resolve em ambos sentidos).
-- Rodar no SQL Editor do Supabase EXTERNO. Idempotente.
-- =====================================================================

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
  v_sender_norm      text;
  v_sender_display   text;
  v_is_master_role   boolean := false;
  v_receiver_pid     uuid;
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

  -- Sender: pega perfil do usuário autenticado
  SELECT p.id,
         lower(COALESCE(p.username,'')),
         regexp_replace(lower(COALESCE(p.username,'')), '[^a-z0-9]', '', 'g'),
         COALESCE(NULLIF(p.name,''), NULLIF(p.username,''), 'Oculto Master')
    INTO v_sender_profile, v_sender_username, v_sender_norm, v_sender_display
    FROM public.profiles p
   WHERE (p.id = v_uid OR p.user_id = v_uid)
   ORDER BY (CASE WHEN p.user_id = v_uid THEN 0 ELSE 1 END)
   LIMIT 1;

  -- Verifica role admin_master também
  BEGIN
    SELECT public.has_role(v_uid, 'admin_master') INTO v_is_master_role;
  EXCEPTION WHEN OTHERS THEN
    v_is_master_role := false;
  END;

  IF NOT (v_is_master_role OR v_sender_norm = 'ocultomaster') THEN
    RAISE EXCEPTION 'master only';
  END IF;

  -- Resolve receptor: aceita profile.id OU profile.user_id OU auth.users.id
  SELECT p.id, p.user_id
    INTO v_receiver_pid, v_receiver_user_id
    FROM public.profiles p
   WHERE p.id = p_receiver_profile_id OR p.user_id = p_receiver_profile_id
   ORDER BY (CASE WHEN p.id = p_receiver_profile_id THEN 0 ELSE 1 END)
   LIMIT 1;

  IF v_receiver_pid IS NULL THEN
    RAISE EXCEPTION 'receiver not found';
  END IF;

  -- Já presenteou?
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_aura_xp_gifts
     WHERE sender_id = v_uid AND receiver_id = v_receiver_pid
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'already_gifted', true, 'receiver', v_receiver_pid);
  END IF;

  -- Crédito de XP
  BEGIN
    UPDATE public.profiles
       SET aura_xp    = COALESCE(aura_xp, 0) + p_amount,
           aura_level = COALESCE(public.aura_level_from_xp(COALESCE(aura_xp,0) + p_amount), aura_level)
     WHERE id = v_receiver_pid;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.profiles
       SET aura_xp = COALESCE(aura_xp, 0) + p_amount
     WHERE id = v_receiver_pid;
  END;

  -- Registra presente (dispara realtime → useGiftNotifications)
  INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount)
  VALUES (v_uid, v_receiver_pid, p_amount)
  RETURNING id INTO v_gift_id;

  -- Notificação redundante (best-effort)
  IF v_receiver_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
      VALUES (
        v_receiver_user_id,
        'gift_received',
        '@' || COALESCE(v_sender_username, 'oculto_master') || ' te enviou ' || p_amount || ' XP',
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
    'receiver', v_receiver_pid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_master_gift_single_xp(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_master_gift_single_xp(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
