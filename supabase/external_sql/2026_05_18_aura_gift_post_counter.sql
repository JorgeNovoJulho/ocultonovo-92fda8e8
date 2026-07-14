-- =========================================================================
-- Aura XP Gifts: associação opcional a um post + contador público
-- - Adiciona coluna post_id (nullable) em oculto_aura_xp_gifts
-- - Recria aura_send_xp_gift com 3º parâmetro p_post_id (DEFAULT NULL)
-- - Cria RPC público aura_xp_gifts_count_for_post(post_id) -> {count, total_xp}
-- Idempotente. Cole inteiro no SQL Editor do Supabase externo.
-- =========================================================================

ALTER TABLE public.oculto_aura_xp_gifts
  ADD COLUMN IF NOT EXISTS post_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_aura_xp_gifts_post
  ON public.oculto_aura_xp_gifts (post_id)
  WHERE post_id IS NOT NULL;

-- Recria função adicionando p_post_id como parâmetro opcional ao final.
DROP FUNCTION IF EXISTS public.aura_send_xp_gift(uuid, integer);
DROP FUNCTION IF EXISTS public.aura_send_xp_gift(uuid, integer, uuid);

CREATE OR REPLACE FUNCTION public.aura_send_xp_gift(
  p_receiver_profile_id uuid,
  p_amount integer,
  p_post_id uuid DEFAULT NULL
)
RETURNS TABLE (
  success      boolean,
  sender_xp    integer,
  sender_level integer,
  receiver_xp  integer,
  gift_id      uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sender_profile uuid;
  v_receiver_profile uuid;
  v_sender_xp integer;
  v_receiver_xp integer;
  v_new_sender_xp integer;
  v_new_sender_level integer;
  v_new_receiver_xp integer;
  v_gift_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_amount IS NULL OR p_amount < 5 OR p_amount > 500 THEN
    RAISE EXCEPTION 'amount must be between 5 and 500';
  END IF;
  IF p_receiver_profile_id IS NULL THEN RAISE EXCEPTION 'receiver required'; END IF;

  SELECT p.id, COALESCE(p.aura_xp,0) INTO v_sender_profile, v_sender_xp
    FROM public.profiles p
   WHERE p.id = v_uid OR p.user_id = v_uid
   LIMIT 1;
  IF v_sender_profile IS NULL THEN RAISE EXCEPTION 'sender profile not found'; END IF;

  SELECT p.id, COALESCE(p.aura_xp,0) INTO v_receiver_profile, v_receiver_xp
    FROM public.profiles p
   WHERE p.id = p_receiver_profile_id
   LIMIT 1;
  IF v_receiver_profile IS NULL THEN RAISE EXCEPTION 'receiver not found'; END IF;
  IF v_receiver_profile = v_sender_profile THEN RAISE EXCEPTION 'cannot gift yourself'; END IF;
  IF v_sender_xp < p_amount THEN RAISE EXCEPTION 'insufficient xp'; END IF;

  v_new_sender_xp   := v_sender_xp - p_amount;
  v_new_receiver_xp := v_receiver_xp + p_amount;
  v_new_sender_level := GREATEST(1, (v_new_sender_xp / 100) + 1);

  UPDATE public.profiles SET aura_xp = v_new_sender_xp, aura_level = v_new_sender_level
    WHERE id = v_sender_profile;
  UPDATE public.profiles SET aura_xp = v_new_receiver_xp,
         aura_level = GREATEST(1, (v_new_receiver_xp / 100) + 1)
    WHERE id = v_receiver_profile;

  INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount, post_id)
    VALUES (v_sender_profile, v_receiver_profile, p_amount, p_post_id)
    RETURNING id INTO v_gift_id;

  RETURN QUERY SELECT true, v_new_sender_xp, v_new_sender_level, v_new_receiver_xp, v_gift_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.aura_send_xp_gift(uuid, integer, uuid) TO authenticated;

-- Contador público por post (qualquer um pode ver totais agregados)
CREATE OR REPLACE FUNCTION public.aura_xp_gifts_count_for_post(p_post_id uuid)
RETURNS TABLE (gifts_count integer, total_xp integer)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(COUNT(*), 0)::int,
         COALESCE(SUM(amount), 0)::int
    FROM public.oculto_aura_xp_gifts
   WHERE post_id = p_post_id;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_gifts_count_for_post(uuid)
  TO anon, authenticated;
