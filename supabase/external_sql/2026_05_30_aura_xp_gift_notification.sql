-- =====================================================================
-- Aura — Presente de XP: dispara notificação para o destinatário
-- Idempotente. Rodar no SQL Editor do Supabase externo.
--
-- O que faz:
--   1) Re-cria a RPC public.aura_send_xp_gift incluindo INSERT em
--      public.notifications (type='gift_received') para o destinatário,
--      garantindo que o modal "Presente recebido" abra em tempo real
--      no app do destinatário (canal já existente em useGiftNotifications).
--   2) Habilita REPLICA IDENTITY FULL e adiciona oculto_aura_xp_gifts
--      à publication supabase_realtime (canal redundante de segurança).
--   3) NOTIFY pgrst para recarregar schema.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_send_xp_gift(
  p_receiver_profile_id uuid,
  p_amount integer,
  p_post_id uuid DEFAULT NULL
)
RETURNS TABLE (
  success         boolean,
  sender_xp       integer,
  sender_level    integer,
  receiver_xp     integer,
  gift_id         uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sender_profile uuid;
  v_receiver_profile uuid;
  v_receiver_user_id uuid;
  v_sender_xp integer;
  v_receiver_xp integer;
  v_new_sender_xp integer;
  v_new_sender_level integer;
  v_new_receiver_xp integer;
  v_gift_id uuid;
  v_sender_display text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_amount IS NULL OR p_amount < 5 OR p_amount > 500 THEN
    RAISE EXCEPTION 'amount must be between 5 and 500';
  END IF;
  IF p_receiver_profile_id IS NULL THEN
    RAISE EXCEPTION 'receiver required';
  END IF;

  -- Resolve perfil do remetente (id OR user_id)
  SELECT id, COALESCE(aura_xp,0),
         COALESCE(NULLIF(name,''), NULLIF(username,''), 'Usuário')
    INTO v_sender_profile, v_sender_xp, v_sender_display
    FROM public.profiles
   WHERE id = v_uid OR user_id = v_uid
   LIMIT 1;

  IF v_sender_profile IS NULL THEN
    RAISE EXCEPTION 'sender profile not found';
  END IF;

  -- Resolve perfil + user_id do destinatário (id OR user_id)
  SELECT id, user_id, COALESCE(aura_xp,0)
    INTO v_receiver_profile, v_receiver_user_id, v_receiver_xp
    FROM public.profiles
   WHERE id = p_receiver_profile_id OR user_id = p_receiver_profile_id
   LIMIT 1;

  IF v_receiver_profile IS NULL THEN
    RAISE EXCEPTION 'receiver profile not found';
  END IF;

  IF v_receiver_profile = v_sender_profile THEN
    RAISE EXCEPTION 'cannot send gift to yourself';
  END IF;

  IF v_sender_xp < p_amount THEN
    RAISE EXCEPTION 'insufficient aura_xp (balance=%, need=%)', v_sender_xp, p_amount;
  END IF;

  -- Debita do remetente
  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) - p_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp,0) - p_amount))
   WHERE id = v_sender_profile
   RETURNING aura_xp, aura_level INTO v_new_sender_xp, v_new_sender_level;

  -- Credita no destinatário
  UPDATE public.profiles
     SET aura_xp = COALESCE(aura_xp,0) + p_amount,
         aura_level = public.aura_level_from_xp(COALESCE(aura_xp,0) + p_amount)
   WHERE id = v_receiver_profile
   RETURNING aura_xp INTO v_new_receiver_xp;

  -- Log do presente
  BEGIN
    INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount, post_id)
    VALUES (v_uid, v_receiver_profile, p_amount, p_post_id)
    RETURNING id INTO v_gift_id;
  EXCEPTION WHEN undefined_column THEN
    -- compat com schema antigo sem coluna post_id
    INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount)
    VALUES (v_uid, v_receiver_profile, p_amount)
    RETURNING id INTO v_gift_id;
  END;

  -- Notificação para o destinatário (dispara modal "Presente recebido" via realtime)
  IF v_receiver_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_receiver_user_id,
        'gift_received',
        v_sender_display || ' te enviou ' || p_amount || ' XP',
        NULL,
        jsonb_build_object(
          'from_user_id', v_uid,
          'sender_profile_id', v_sender_profile,
          'amount', p_amount,
          'gift_id', v_gift_id,
          'post_id', p_post_id
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Progride missão "send_gift" do remetente (não-bloqueante)
  BEGIN
    PERFORM public.aura_progress_quest('send_gift', 1);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY SELECT true, v_new_sender_xp, v_new_sender_level, v_new_receiver_xp, v_gift_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_send_xp_gift(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_send_xp_gift(uuid, integer) TO authenticated;

-- Realtime redundante para a tabela de presentes
ALTER TABLE public.oculto_aura_xp_gifts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_aura_xp_gifts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_xp_gifts';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
