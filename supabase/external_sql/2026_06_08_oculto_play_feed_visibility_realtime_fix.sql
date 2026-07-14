-- ==========================================================================
-- OCULTO PLAY — correção de cards invisíveis + realtime
-- Uso: cole no SQL Editor do Supabase EXTERNO.
-- Idempotente: pode rodar várias vezes.
-- ==========================================================================

-- 1) Helper robusto para reconhecer o Master também por JWT/perfil,
--    não apenas por user_roles. Isso corrige o caso em que a UI libera
--    o master, mas a RPC oculto_play_feed() retornava [] no backend.
CREATE OR REPLACE FUNCTION public._oculto_play_is_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT
      auth.uid() AS uid,
      lower(coalesce(auth.jwt() ->> 'email', '')) AS jwt_email
  )
  SELECT COALESCE((SELECT uid FROM me) IS NOT NULL, false)
    AND (
      (SELECT jwt_email FROM me) = 'ocultomaster@ocultoswing.com.br'
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = (SELECT uid FROM me)
          AND ur.role::text = 'admin_master'
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.user_id = (SELECT uid FROM me)
          AND (
            lower(coalesce(p.email, '')) = 'ocultomaster@ocultoswing.com.br'
            OR regexp_replace(lower(coalesce(p.username, '')), '[^a-z0-9]', '', 'g') = 'ocultomaster'
            OR regexp_replace(lower(coalesce(p.name, '')), '[^a-z0-9]', '', 'g') = 'ocultomaster'
          )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public._oculto_play_is_master() TO authenticated;

-- 2) Gate oficial corrigido: Master sempre acessa; usuários comuns seguem
--    respeitando enabled + allowlist/beta/visible_to_users.
CREATE OR REPLACE FUNCTION public.can_access_oculto_play()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r public.oculto_play_config;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  IF public._oculto_play_is_master() THEN RETURN true; END IF;

  SELECT * INTO r FROM public.oculto_play_config ORDER BY created_at ASC LIMIT 1;
  IF r IS NULL OR COALESCE(r.enabled, false) = false THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM public.oculto_play_allowlist WHERE user_id = v_uid) THEN
    RETURN true;
  END IF;

  IF COALESCE(r.beta_open, false) = true THEN RETURN true; END IF;

  RETURN COALESCE(r.visible_to_users, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_oculto_play() TO authenticated;

-- 3) Corrige itens já publicados com author_id = auth.uid(), convertendo para
--    profiles.id quando houver profile canônico. Isso preserva exclusão pelo autor.
UPDATE public.oculto_play_items i
SET author_id = p.id
FROM public.profiles p
WHERE i.author_id = p.user_id
  AND i.author_id IS DISTINCT FROM p.id;

-- 4) SELECT policy robusta: usuários com acesso veem publicados; autor também
--    consegue ver o próprio conteúdo válido.
DROP POLICY IF EXISTS "op_items_select_gated" ON public.oculto_play_items;
CREATE POLICY "op_items_select_gated"
  ON public.oculto_play_items
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      public.can_access_oculto_play()
      OR author_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = author_id
          AND p.user_id = auth.uid()
      )
    )
  );

-- 5) Feed corrigido: usa o mesmo gate robusto, mantém autor via profiles.id
--    e ainda resolve itens antigos em que author_id estava como auth.uid().
CREATE OR REPLACE FUNCTION public.oculto_play_feed(
  p_section public.oculto_play_section DEFAULT 'normal',
  p_kind    public.oculto_play_kind DEFAULT NULL,
  p_limit   int DEFAULT 20,
  p_before  timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid, author_id uuid, kind public.oculto_play_kind,
  section public.oculto_play_section, visibility public.oculto_play_visibility,
  title text, caption text, media_url text, thumb_url text, audio_url text,
  duration_sec int, tags text[],
  view_count int, like_count int, save_count int, share_count int,
  published_at timestamptz, expires_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  liked_by_me boolean, saved_by_me boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_oculto_play() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.author_id, i.kind, i.section, i.visibility,
    i.title, i.caption, i.media_url, i.thumb_url, i.audio_url,
    i.duration_sec,
    COALESCE(NULLIF(i.tags, '{}'::text[]), i.genre_tags, '{}'::text[]) AS tags,
    i.view_count, i.like_count, i.save_count, i.share_count,
    i.published_at, i.expires_at,
    p.username, p.display_name, p.avatar_url,
    EXISTS (SELECT 1 FROM public.oculto_play_likes l WHERE l.item_id = i.id AND l.user_id = auth.uid()) AS liked_by_me,
    EXISTS (SELECT 1 FROM public.oculto_play_saves s WHERE s.item_id = i.id AND s.user_id = auth.uid()) AS saved_by_me
  FROM public.oculto_play_items i
  LEFT JOIN public.profiles p
    ON p.id = i.author_id
    OR p.user_id = i.author_id
  WHERE i.is_published = true
    AND i.section = p_section
    AND (p_kind IS NULL OR i.kind = p_kind)
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (p_before IS NULL OR i.published_at < p_before)
  ORDER BY i.published_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_feed(
  public.oculto_play_section, public.oculto_play_kind, int, timestamptz
) TO authenticated;

-- 6) Realtime: garante payload completo e publication ativa para INSERT/UPDATE/DELETE.
ALTER TABLE public.oculto_play_items REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_play_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_items;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- FIM
-- ==========================================================================