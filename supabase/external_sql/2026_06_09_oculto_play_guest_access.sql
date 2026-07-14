-- ============================================================================
-- OCULTO PLAY — Acesso de Visitante (sem login) para links compartilhados
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. NÃO toca em RLS/policies. Apenas cria RPCs SECURITY DEFINER
-- que devolvem itens públicos (não-VIP, não-Premium) para reprodução por
-- visitantes anônimos. Itens VIP/Premium retornam apenas metadados com
-- locked=true, sem vazar media_url/audio_url.
-- ============================================================================

-- ─── Item completo para visitante (somente conteúdo público/free) ───────────
CREATE OR REPLACE FUNCTION public.oculto_play_guest_item(
  p_item_id uuid
) RETURNS TABLE (
  id                  uuid,
  kind                text,
  title               text,
  caption             text,
  thumb_url           text,
  media_url           text,
  audio_url           text,
  visibility          text,
  duration_sec        int,
  view_count          int,
  like_count          int,
  share_count         int,
  comment_count       int,
  published_at        timestamptz,
  author_id           uuid,
  author_username     text,
  author_display_name text,
  author_avatar_url   text,
  locked              boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_locked boolean;
BEGIN
  SELECT (i.visibility IN ('vip','premium')) INTO v_locked
    FROM public.oculto_play_items i
   WHERE i.id = p_item_id
     AND (i.expires_at IS NULL OR i.expires_at > now())
   LIMIT 1;

  IF v_locked IS NULL THEN
    RETURN; -- não existe / expirado
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.kind::text,
    i.title,
    CASE
      WHEN i.caption IS NULL THEN NULL
      WHEN length(i.caption) > 400 THEN substring(i.caption from 1 for 397) || '…'
      ELSE i.caption
    END AS caption,
    i.thumb_url,
    CASE WHEN v_locked THEN NULL ELSE i.media_url END AS media_url,
    CASE WHEN v_locked THEN NULL ELSE i.audio_url END AS audio_url,
    i.visibility::text,
    i.duration_sec,
    COALESCE(i.view_count, 0),
    COALESCE(i.like_count, 0),
    COALESCE(i.share_count, 0),
    COALESCE(i.comment_count, 0),
    i.published_at,
    i.author_id,
    p.username,
    p.display_name,
    p.avatar_url,
    v_locked
  FROM public.oculto_play_items i
  LEFT JOIN public.profiles p ON p.id = i.author_id
  WHERE i.id = p_item_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_guest_item(uuid) TO anon, authenticated;

-- ─── Contador de visualização para visitante (sem autenticação) ─────────────
CREATE OR REPLACE FUNCTION public.oculto_play_guest_register_view(
  p_item_id uuid
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
  v_visibility text;
BEGIN
  IF p_item_id IS NULL THEN RETURN 0; END IF;

  SELECT visibility::text INTO v_visibility
    FROM public.oculto_play_items
   WHERE id = p_item_id
     AND (expires_at IS NULL OR expires_at > now())
   LIMIT 1;

  IF v_visibility IS NULL THEN RETURN 0; END IF;
  -- Só conta visualização de itens públicos/free (VIP/Premium ficam travados)
  IF v_visibility IN ('vip','premium') THEN
    SELECT COALESCE(view_count,0) INTO v_count
      FROM public.oculto_play_items WHERE id = p_item_id;
    RETURN COALESCE(v_count,0);
  END IF;

  UPDATE public.oculto_play_items
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = p_item_id
  RETURNING view_count INTO v_count;

  RETURN COALESCE(v_count, 0);
END
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_guest_register_view(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
