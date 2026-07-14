-- ============================================================
-- ADMIN MASTER · Presente em massa para usuários online
-- RPC: public.admin_master_gift_online_xp(p_amount int)
--
-- - Validação master: apenas @ocultomaster pode executar.
-- - Insere em oculto_aura_xp_gifts (dispara modal de gift via realtime)
--   e em public.notifications (type='gift_received') como redundância.
-- - Atualiza aura_xp/aura_level do destinatário.
-- - Master NÃO perde XP (brinde administrativo).
-- - Idempotente; pode rodar quantas vezes precisar.
-- Executar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_master_gift_online_xp(
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
  v_total            int  := 0;
  v_rec              record;
  v_gift_id          uuid;
  v_five_min_ago     timestamptz := now() - interval '5 minutes';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'amount must be between 1 and 10000';
  END IF;

  -- Validação master: somente @ocultomaster
  SELECT id, COALESCE(NULLIF(username,''),''),
         COALESCE(NULLIF(name,''), NULLIF(username,''), 'Oculto Master')
    INTO v_sender_profile, v_sender_username, v_sender_display
    FROM public.profiles
   WHERE (id = v_uid OR user_id = v_uid)
   LIMIT 1;

  IF v_sender_profile IS NULL THEN
    RAISE EXCEPTION 'sender profile not found';
  END IF;

  IF lower(v_sender_username) <> 'ocultomaster' THEN
    RAISE EXCEPTION 'master only';
  END IF;

  -- Loop sobre usuários online (excluindo o próprio master, seeds e banidos)
  FOR v_rec IN
    SELECT p.id AS profile_id, p.user_id
      FROM public.profiles p
     WHERE p.is_online = true
       AND p.last_seen >= v_five_min_ago
       AND COALESCE(p.is_seed, false) = false
       AND p.banned_at IS NULL
       AND p.id <> v_sender_profile
  LOOP
    -- 1) Crédita XP no destinatário
    BEGIN
      UPDATE public.profiles
         SET aura_xp    = COALESCE(aura_xp, 0) + p_amount,
             aura_level = COALESCE(public.aura_level_from_xp(COALESCE(aura_xp,0) + p_amount), aura_level)
       WHERE id = v_rec.profile_id;
    EXCEPTION WHEN OTHERS THEN
      -- se aura_level_from_xp não existir, atualiza só o XP
      UPDATE public.profiles
         SET aura_xp = COALESCE(aura_xp, 0) + p_amount
       WHERE id = v_rec.profile_id;
    END;

    -- 2) Registra o presente (dispara realtime → useGiftNotifications)
    BEGIN
      INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount)
      VALUES (v_uid, v_rec.profile_id, p_amount)
      RETURNING id INTO v_gift_id;
    EXCEPTION WHEN OTHERS THEN
      v_gift_id := NULL;
    END;

    -- 3) Notificação redundante (modal de presente também escuta este canal)
    IF v_rec.user_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
        VALUES (
          v_rec.user_id,
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
            'source',            'admin_master_online_broadcast'
          ),
          false
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',         true,
    'total_sent', v_total,
    'amount',     p_amount,
    'server_now', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_master_gift_online_xp(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_master_gift_online_xp(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
