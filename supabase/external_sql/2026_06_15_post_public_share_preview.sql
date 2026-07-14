-- 2026_06_15 — RPC pública para preview do link /c/:id (posts compartilhados)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Idempotente. SECURITY DEFINER devolvendo APENAS um snapshot seguro,
-- contornando RLS para anon/visitantes que abrem o link público.
-- Nunca expõe e-mail, telefone, doc, nem posts ocultos/arquivados.

DROP FUNCTION IF EXISTS public.post_public_share_preview(text);

CREATE OR REPLACE FUNCTION public.post_public_share_preview(
  p_id_or_slug text
) RETURNS TABLE (
  id                   uuid,
  content_text         text,
  media_url            text,
  media_type           text,
  paid_price           numeric,
  section_type         text,
  author_id            uuid,
  share_slug           text,
  preview_blur         text,
  link_preview_image_url text,
  link_preview_title   text,
  link_preview_description text,
  created_at           timestamptz,
  author_username      text,
  author_display_name  text,
  author_avatar_url    text,
  channel_title        text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_uuid uuid;
BEGIN
  -- Tenta resolver por UUID; se não for UUID válido, ignora e tenta por slug.
  BEGIN
    v_uuid := p_id_or_slug::uuid;
  EXCEPTION WHEN others THEN
    v_uuid := NULL;
  END;

  -- 1) Por share_slug (string crua).
  SELECT p0.* INTO v_post
  FROM public.posts p0
  WHERE p0.share_slug = p_id_or_slug
  LIMIT 1;

  -- 2) Por id (UUID).
  IF NOT FOUND AND v_uuid IS NOT NULL THEN
    SELECT p1.* INTO v_post
    FROM public.posts p1
    WHERE p1.id = v_uuid
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Filtra posts ocultos/arquivados de qualquer preview público.
  IF COALESCE(v_post.is_hidden, false) = true THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_post.id,
    v_post.content_text,
    v_post.media_url,
    v_post.media_type,
    v_post.paid_price,
    v_post.section_type,
    v_post.author_id,
    v_post.share_slug,
    v_post.preview_blur,
    v_post.link_preview_image_url,
    v_post.style_meta ->> 'link_preview_title',
    v_post.style_meta ->> 'link_preview_description',
    v_post.created_at,
    p.username,
    p.display_name,
    p.avatar_url,
    sp.title
  FROM (SELECT 1) x
  LEFT JOIN public.profiles p
    ON p.id = v_post.author_id OR p.user_id = v_post.author_id
  LEFT JOIN public.subscription_plans sp
    ON sp.profile_id = v_post.author_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_public_share_preview(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
