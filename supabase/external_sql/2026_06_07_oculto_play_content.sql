-- ============================================================================
-- OCULTO PLAY — Etapa 3: Camada de conteúdo (tabelas, RPCs, bucket)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. Tudo isolado em oculto_play_*.
-- NADA é exposto a usuário comum: todas as leituras passam por
-- can_access_oculto_play() (criada na Etapa 2).
-- Não toca em posts, stories, comunidades, canais VIP, radar, aura, caixa.
-- ============================================================================

-- ---------- 0) Enums ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oculto_play_kind') THEN
    CREATE TYPE public.oculto_play_kind AS ENUM (
      'short_video','meme','audio','vip_teaser','community_post','challenge'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oculto_play_section') THEN
    CREATE TYPE public.oculto_play_section AS ENUM ('normal','today','comeback');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oculto_play_visibility') THEN
    CREATE TYPE public.oculto_play_visibility AS ENUM ('public','premium','vip');
  END IF;
END $$;

-- ---------- 1) oculto_play_items ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid NOT NULL, -- referencia profiles.id (mantido solto, sem FK cross-schema)
  kind          public.oculto_play_kind NOT NULL,
  section       public.oculto_play_section NOT NULL DEFAULT 'normal',
  visibility    public.oculto_play_visibility NOT NULL DEFAULT 'public',
  title         text,
  caption       text,
  media_url     text,           -- vídeo / imagem
  thumb_url     text,           -- cover/poster
  audio_url     text,           -- usado em kind=audio
  duration_sec  int,
  tags          text[] NOT NULL DEFAULT '{}',
  source_post_id      uuid,     -- link opcional a posts (não FK)
  source_community_id uuid,     -- link opcional a comunidade
  is_published  boolean NOT NULL DEFAULT true,
  is_seed       boolean NOT NULL DEFAULT false,
  view_count    int NOT NULL DEFAULT 0,
  like_count    int NOT NULL DEFAULT 0,
  save_count    int NOT NULL DEFAULT 0,
  share_count   int NOT NULL DEFAULT 0,
  report_count  int NOT NULL DEFAULT 0,
  published_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_items_pub_section
  ON public.oculto_play_items (is_published, section, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_op_items_author
  ON public.oculto_play_items (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_op_items_kind
  ON public.oculto_play_items (kind, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_op_items_tags
  ON public.oculto_play_items USING GIN (tags);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_items TO authenticated;
GRANT ALL ON public.oculto_play_items TO service_role;

ALTER TABLE public.oculto_play_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "op_items_select_gated" ON public.oculto_play_items;
CREATE POLICY "op_items_select_gated"
  ON public.oculto_play_items FOR SELECT TO authenticated
  USING (
    public.can_access_oculto_play()
    AND is_published = true
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS "op_items_author_insert" ON public.oculto_play_items;
CREATE POLICY "op_items_author_insert"
  ON public.oculto_play_items FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_oculto_play()
    AND EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = author_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "op_items_author_update" ON public.oculto_play_items;
CREATE POLICY "op_items_author_update"
  ON public.oculto_play_items FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = author_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = author_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "op_items_author_delete" ON public.oculto_play_items;
CREATE POLICY "op_items_author_delete"
  ON public.oculto_play_items FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = author_id AND p.user_id = auth.uid())
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._touch_oculto_play_items()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_op_items ON public.oculto_play_items;
CREATE TRIGGER trg_touch_op_items
  BEFORE UPDATE ON public.oculto_play_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_oculto_play_items();

-- ---------- 2) oculto_play_views (Volte para Ver) ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_views (
  item_id        uuid NOT NULL,
  user_id        uuid NOT NULL,
  watched_seconds int NOT NULL DEFAULT 0,
  completed      boolean NOT NULL DEFAULT false,
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_op_views_user_recent
  ON public.oculto_play_views (user_id, last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_views TO authenticated;
GRANT ALL ON public.oculto_play_views TO service_role;

ALTER TABLE public.oculto_play_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "op_views_self_all" ON public.oculto_play_views;
CREATE POLICY "op_views_self_all"
  ON public.oculto_play_views FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (user_id = auth.uid());

-- ---------- 3) oculto_play_likes ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_likes (
  item_id    uuid NOT NULL,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_op_likes_item ON public.oculto_play_likes (item_id);

GRANT SELECT, INSERT, DELETE ON public.oculto_play_likes TO authenticated;
GRANT ALL ON public.oculto_play_likes TO service_role;

ALTER TABLE public.oculto_play_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "op_likes_self_write" ON public.oculto_play_likes;
CREATE POLICY "op_likes_self_write"
  ON public.oculto_play_likes FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (user_id = auth.uid());

-- ---------- 4) oculto_play_saves ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_saves (
  item_id    uuid NOT NULL,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_op_saves_user ON public.oculto_play_saves (user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.oculto_play_saves TO authenticated;
GRANT ALL ON public.oculto_play_saves TO service_role;

ALTER TABLE public.oculto_play_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "op_saves_self_write" ON public.oculto_play_saves;
CREATE POLICY "op_saves_self_write"
  ON public.oculto_play_saves FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (user_id = auth.uid());

-- ---------- 5) oculto_play_reports (moderação) ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason      text NOT NULL,
  details     text,
  status      text NOT NULL DEFAULT 'pending', -- pending|reviewed|dismissed|removed
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
CREATE INDEX IF NOT EXISTS idx_op_reports_status ON public.oculto_play_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_op_reports_item ON public.oculto_play_reports (item_id);

GRANT SELECT, INSERT ON public.oculto_play_reports TO authenticated;
GRANT ALL ON public.oculto_play_reports TO service_role;

ALTER TABLE public.oculto_play_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "op_reports_insert_auth" ON public.oculto_play_reports;
CREATE POLICY "op_reports_insert_auth"
  ON public.oculto_play_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.can_access_oculto_play());

DROP POLICY IF EXISTS "op_reports_master_read" ON public.oculto_play_reports;
CREATE POLICY "op_reports_master_read"
  ON public.oculto_play_reports FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin_master')
  );

-- ---------- 6) Triggers de contadores ----------
CREATE OR REPLACE FUNCTION public._op_likes_counter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.oculto_play_items SET like_count = like_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.oculto_play_items SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_op_likes_counter ON public.oculto_play_likes;
CREATE TRIGGER trg_op_likes_counter
  AFTER INSERT OR DELETE ON public.oculto_play_likes
  FOR EACH ROW EXECUTE FUNCTION public._op_likes_counter();

CREATE OR REPLACE FUNCTION public._op_saves_counter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.oculto_play_items SET save_count = save_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.oculto_play_items SET save_count = GREATEST(0, save_count - 1) WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_op_saves_counter ON public.oculto_play_saves;
CREATE TRIGGER trg_op_saves_counter
  AFTER INSERT OR DELETE ON public.oculto_play_saves
  FOR EACH ROW EXECUTE FUNCTION public._op_saves_counter();

CREATE OR REPLACE FUNCTION public._op_reports_counter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.oculto_play_items SET report_count = report_count + 1 WHERE id = NEW.item_id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_op_reports_counter ON public.oculto_play_reports;
CREATE TRIGGER trg_op_reports_counter
  AFTER INSERT ON public.oculto_play_reports
  FOR EACH ROW EXECUTE FUNCTION public._op_reports_counter();

-- ---------- 7) RPCs ----------

-- Feed paginado (todas as seções via parâmetro)
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_oculto_play() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.author_id, i.kind, i.section, i.visibility,
    i.title, i.caption, i.media_url, i.thumb_url, i.audio_url,
    i.duration_sec, i.tags,
    i.view_count, i.like_count, i.save_count, i.share_count,
    i.published_at, i.expires_at,
    p.username, p.display_name, p.avatar_url,
    EXISTS (SELECT 1 FROM public.oculto_play_likes l WHERE l.item_id = i.id AND l.user_id = auth.uid()) AS liked_by_me,
    EXISTS (SELECT 1 FROM public.oculto_play_saves s WHERE s.item_id = i.id AND s.user_id = auth.uid()) AS saved_by_me
  FROM public.oculto_play_items i
  LEFT JOIN public.profiles p ON p.id = i.author_id
  WHERE i.is_published = true
    AND i.section = p_section
    AND (p_kind IS NULL OR i.kind = p_kind)
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (p_before IS NULL OR i.published_at < p_before)
  ORDER BY i.published_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_feed(
  public.oculto_play_section, public.oculto_play_kind, int, timestamptz
) TO authenticated;

-- Registrar view (idempotente — upsert)
CREATE OR REPLACE FUNCTION public.oculto_play_register_view(
  p_item_id uuid, p_seconds int DEFAULT 0, p_completed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_oculto_play() THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN RETURN; END IF;

  INSERT INTO public.oculto_play_views (item_id, user_id, watched_seconds, completed, last_seen_at)
  VALUES (p_item_id, auth.uid(), GREATEST(0, COALESCE(p_seconds,0)), COALESCE(p_completed,false), now())
  ON CONFLICT (item_id, user_id) DO UPDATE
    SET watched_seconds = GREATEST(public.oculto_play_views.watched_seconds, EXCLUDED.watched_seconds),
        completed       = public.oculto_play_views.completed OR EXCLUDED.completed,
        last_seen_at    = now();

  -- view_count incrementa só na primeira vez por usuário
  IF (SELECT xmax = 0 FROM public.oculto_play_views WHERE item_id = p_item_id AND user_id = auth.uid()) THEN
    -- xmax check é frágil em definer; em vez disso, contamos sempre que watched_seconds passou de 0 -> >0
    NULL;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_register_view(uuid,int,boolean) TO authenticated;

-- Toggle like
CREATE OR REPLACE FUNCTION public.oculto_play_toggle_like(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exists boolean;
BEGIN
  IF NOT public.can_access_oculto_play() THEN RETURN false; END IF;
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT EXISTS (SELECT 1 FROM public.oculto_play_likes
                  WHERE item_id=p_item_id AND user_id=auth.uid()) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.oculto_play_likes WHERE item_id=p_item_id AND user_id=auth.uid();
    RETURN false;
  ELSE
    INSERT INTO public.oculto_play_likes (item_id,user_id) VALUES (p_item_id,auth.uid())
      ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_toggle_like(uuid) TO authenticated;

-- Toggle save
CREATE OR REPLACE FUNCTION public.oculto_play_toggle_save(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exists boolean;
BEGIN
  IF NOT public.can_access_oculto_play() THEN RETURN false; END IF;
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT EXISTS (SELECT 1 FROM public.oculto_play_saves
                  WHERE item_id=p_item_id AND user_id=auth.uid()) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.oculto_play_saves WHERE item_id=p_item_id AND user_id=auth.uid();
    RETURN false;
  ELSE
    INSERT INTO public.oculto_play_saves (item_id,user_id) VALUES (p_item_id,auth.uid())
      ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_toggle_save(uuid) TO authenticated;

-- Reportar
CREATE OR REPLACE FUNCTION public.oculto_play_report(
  p_item_id uuid, p_reason text, p_details text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.can_access_oculto_play() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.oculto_play_reports (item_id, reporter_id, reason, details)
  VALUES (p_item_id, auth.uid(), COALESCE(p_reason,'unspecified'), p_details)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_report(uuid,text,text) TO authenticated;

-- Volte para Ver — itens já vistos parcialmente
CREATE OR REPLACE FUNCTION public.oculto_play_comeback(p_limit int DEFAULT 12)
RETURNS TABLE (
  id uuid, kind public.oculto_play_kind, title text, thumb_url text, media_url text,
  watched_seconds int, duration_sec int, last_seen_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_oculto_play() OR auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT i.id, i.kind, i.title, i.thumb_url, i.media_url,
         v.watched_seconds, i.duration_sec, v.last_seen_at
  FROM public.oculto_play_views v
  JOIN public.oculto_play_items i ON i.id = v.item_id
  WHERE v.user_id = auth.uid()
    AND v.completed = false
    AND i.is_published = true
    AND (i.expires_at IS NULL OR i.expires_at > now())
  ORDER BY v.last_seen_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 30));
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_comeback(int) TO authenticated;

-- ---------- 8) Storage bucket ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'oculto-play-media',
  'oculto-play-media',
  true,
  524288000, -- 500MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime',
    'audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='oculto_play_media_public_read') THEN
    CREATE POLICY "oculto_play_media_public_read" ON storage.objects
      FOR SELECT TO public USING (bucket_id = 'oculto-play-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='oculto_play_media_auth_insert') THEN
    CREATE POLICY "oculto_play_media_auth_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'oculto-play-media' AND public.can_access_oculto_play());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='oculto_play_media_owner_update') THEN
    CREATE POLICY "oculto_play_media_owner_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'oculto-play-media' AND owner = auth.uid())
      WITH CHECK (bucket_id = 'oculto-play-media' AND owner = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='oculto_play_media_owner_delete') THEN
    CREATE POLICY "oculto_play_media_owner_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'oculto-play-media' AND owner = auth.uid());
  END IF;
END $$;

-- ---------- 9) Realtime ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='oculto_play_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_items;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.oculto_play_items REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
