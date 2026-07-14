-- =====================================================================
-- PURCHASE MEDIA RPC — 2026-05-07 (idempotente, v2)
-- Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- Drop antigos para evitar erro 42P13 (mudança de nome de parâmetro)
DROP FUNCTION IF EXISTS public.purchase_media(uuid, uuid);
DROP FUNCTION IF EXISTS public.check_media_access(uuid, uuid);

CREATE OR REPLACE FUNCTION public.purchase_media(
  p_buyer_id uuid,
  p_post_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post       public.posts%ROWTYPE;
  v_seller_id  uuid;
  v_price      numeric(10,2);
  v_already    boolean := false;
  v_access_id  uuid;
BEGIN
  IF p_buyer_id IS NULL OR p_post_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parâmetros inválidos');
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post não encontrado');
  END IF;

  IF COALESCE(v_post.is_paid, false) = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conteúdo não é pago');
  END IF;

  v_price     := COALESCE(v_post.paid_price, 0);
  v_seller_id := COALESCE(v_post.creator_id,
                          (SELECT user_id FROM public.profiles WHERE id = v_post.author_id LIMIT 1));

  IF v_seller_id = p_buyer_id THEN
    RETURN jsonb_build_object('success', true, 'already_purchased', true, 'self_owned', true);
  END IF;

  SELECT id INTO v_access_id
  FROM public.media_access
  WHERE user_id = p_buyer_id AND post_id = p_post_id
  LIMIT 1;

  IF v_access_id IS NOT NULL THEN
    v_already := true;
  ELSE
    INSERT INTO public.media_access (user_id, post_id, seller_id, amount_paid, purchased_at)
    VALUES (p_buyer_id, p_post_id, v_seller_id, v_price, now())
    ON CONFLICT (user_id, post_id) DO NOTHING
    RETURNING id INTO v_access_id;

    IF v_access_id IS NULL THEN
      v_already := true;
      SELECT id INTO v_access_id FROM public.media_access
      WHERE user_id = p_buyer_id AND post_id = p_post_id LIMIT 1;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_purchased', v_already,
    'access_id', v_access_id,
    'amount_paid', v_price,
    'seller_id', v_seller_id,
    'post_id', p_post_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_media(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_media_access(
  p_user_id uuid,
  p_post_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = p_post_id
      AND (
        COALESCE(p.is_paid, false) = false
        OR p.creator_id = p_user_id
        OR EXISTS (SELECT 1 FROM public.media_access ma
                   WHERE ma.post_id = p_post_id AND ma.user_id = p_user_id)
        OR EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = p_user_id AND ur.role IN ('admin','admin_master'))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_media_access(uuid, uuid) TO authenticated;
