-- =====================================================================
-- 2026-06-03 — PRIVACIDADE: forçar @username em RPCs públicas
-- Substitui qualquer COALESCE(name, display_name, username, ...) por
-- '@' || username em campos retornados ou usados como título/body de
-- notificação pública. Mantém admin/financeiro intactos.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) aura_send_xp_gift — usar @username no título da notificação
DROP FUNCTION IF EXISTS public.aura_send_xp_gift(uuid, integer);
DROP FUNCTION IF EXISTS public.aura_send_xp_gift(uuid, integer, uuid);

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
  v_sender_handle text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_amount IS NULL OR p_amount < 5 OR p_amount > 500 THEN
    RAISE EXCEPTION 'amount must be between 5 and 500';
  END IF;
  IF p_receiver_profile_id IS NULL THEN RAISE EXCEPTION 'receiver required'; END IF;

  -- Privacidade: usa SOMENTE @username; jamais nome real.
  SELECT id, COALESCE(aura_xp,0),
         '@' || COALESCE(NULLIF(username,''), 'usuario')
    INTO v_sender_profile, v_sender_xp, v_sender_handle
    FROM public.profiles
   WHERE id = v_uid OR user_id = v_uid
   LIMIT 1;
  IF v_sender_profile IS NULL THEN RAISE EXCEPTION 'sender profile not found'; END IF;

  SELECT id, user_id, COALESCE(aura_xp,0)
    INTO v_receiver_profile, v_receiver_user_id, v_receiver_xp
    FROM public.profiles
   WHERE id = p_receiver_profile_id OR user_id = p_receiver_profile_id
   LIMIT 1;
  IF v_receiver_profile IS NULL THEN RAISE EXCEPTION 'receiver not found'; END IF;
  IF v_receiver_profile = v_sender_profile THEN RAISE EXCEPTION 'cannot gift yourself'; END IF;
  IF v_sender_xp < p_amount THEN
    RAISE EXCEPTION 'insufficient aura_xp (balance=%, need=%)', v_sender_xp, p_amount;
  END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) - p_amount),
         aura_level = COALESCE(public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp,0) - p_amount)), aura_level)
   WHERE id = v_sender_profile
   RETURNING aura_xp, aura_level INTO v_new_sender_xp, v_new_sender_level;

  UPDATE public.profiles
     SET aura_xp = COALESCE(aura_xp,0) + p_amount,
         aura_level = COALESCE(public.aura_level_from_xp(COALESCE(aura_xp,0) + p_amount), aura_level)
   WHERE id = v_receiver_profile
   RETURNING aura_xp INTO v_new_receiver_xp;

  BEGIN
    INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount, post_id)
    VALUES (v_uid, v_receiver_profile, p_amount, p_post_id)
    RETURNING id INTO v_gift_id;
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount)
    VALUES (v_uid, v_receiver_profile, p_amount)
    RETURNING id INTO v_gift_id;
  END;

  IF v_receiver_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_receiver_user_id,
        'gift_received',
        v_sender_handle || ' te enviou ' || p_amount || ' XP',
        NULL,
        jsonb_build_object(
          'from_user_id', v_uid,
          'sender_profile_id', v_sender_profile,
          'sender_handle', v_sender_handle,
          'amount', p_amount,
          'gift_id', v_gift_id,
          'post_id', p_post_id
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  BEGIN
    PERFORM public.aura_progress_quest('send_gift', 1);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY SELECT true, v_new_sender_xp, v_new_sender_level, v_new_receiver_xp, v_gift_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.aura_send_xp_gift(uuid, integer, uuid) TO authenticated;

-- 2) Backfill: limpar notificações antigas de presente que ainda
--    carregam nome real no title (substitui por @username quando possível).
UPDATE public.notifications n
   SET title = '@' || COALESCE(NULLIF(p.username,''), 'usuario')
             || ' te enviou ' || COALESCE((n.data->>'amount'), '0') || ' XP'
  FROM public.profiles p
 WHERE n.type = 'gift_received'
   AND (n.data ? 'from_user_id')
   AND (p.id::text = n.data->>'from_user_id' OR p.user_id::text = n.data->>'from_user_id')
   AND n.title NOT LIKE '@%';

NOTIFY pgrst, 'reload schema';
