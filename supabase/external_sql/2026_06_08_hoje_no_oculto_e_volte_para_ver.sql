-- =====================================================================
-- ETAPA 8 — Hoje no Oculto & Volte para Ver
-- Idempotente. Roda no Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =====================================================================

-- ---------- Tabela: oculto_play_today_picks ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_today_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  item_id uuid NOT NULL,
  position int NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, item_id)
);
ALTER TABLE public.oculto_play_today_picks ADD COLUMN IF NOT EXISTS day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date;
ALTER TABLE public.oculto_play_today_picks ADD COLUMN IF NOT EXISTS item_id uuid NOT NULL;
ALTER TABLE public.oculto_play_today_picks ADD COLUMN IF NOT EXISTS position int NOT NULL DEFAULT 0;
ALTER TABLE public.oculto_play_today_picks ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.oculto_play_today_picks ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.oculto_play_today_picks ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
GRANT SELECT ON public.oculto_play_today_picks TO anon, authenticated;
GRANT ALL ON public.oculto_play_today_picks TO service_role;
ALTER TABLE public.oculto_play_today_picks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY oculto_today_picks_read ON public.oculto_play_today_picks FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_oculto_today_picks_day ON public.oculto_play_today_picks(day DESC);

-- ---------- Tabela: oculto_return_hooks ----------
CREATE TABLE IF NOT EXISTS public.oculto_return_hooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hook_type text NOT NULL, -- comment_reply, content_liked, content_saved, new_from_following, continue_watching, continue_listening, topic_hot, challenge_pending
  title text NOT NULL,
  description text,
  link text,
  item_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','seen','completed','dismissed','expired')),
  priority int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.oculto_return_hooks TO authenticated;
GRANT ALL ON public.oculto_return_hooks TO service_role;
ALTER TABLE public.oculto_return_hooks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY oculto_return_hooks_owner_read ON public.oculto_return_hooks
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY oculto_return_hooks_owner_update ON public.oculto_return_hooks
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_return_hooks_user_status ON public.oculto_return_hooks(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_hooks_expires ON public.oculto_return_hooks(expires_at) WHERE expires_at IS NOT NULL;

-- ---------- RPC: oculto_play_today_list ----------
CREATE OR REPLACE FUNCTION public.oculto_play_today_list(p_day date DEFAULT NULL)
RETURNS TABLE (
  item_id uuid, pos int, note text,
  title text, caption text, thumb_url text, media_url text,
  kind text, visibility text, author_id uuid,
  view_count int, like_count int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.item_id, p.position AS pos, p.note,
         i.title, i.caption, i.thumb_url, i.media_url,
         i.kind::text, COALESCE(i.visibility::text,'public'),
         i.author_id,
         COALESCE(i.view_count,0), COALESCE(i.like_count,0)
  FROM public.oculto_play_today_picks p
  LEFT JOIN public.oculto_play_items i ON i.id = p.item_id
  WHERE p.day = COALESCE(p_day, (now() AT TIME ZONE 'UTC')::date)
    AND (i.is_published IS NULL OR i.is_published = true)
  ORDER BY p.position ASC, p.created_at ASC
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_today_list(date) TO anon, authenticated;

-- ---------- RPC: oculto_play_today_set / unset ----------
CREATE OR REPLACE FUNCTION public.oculto_play_today_set(
  p_item_id uuid, p_position int DEFAULT 0, p_note text DEFAULT NULL, p_day date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_day date := COALESCE(p_day, (now() AT TIME ZONE 'UTC')::date);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  INSERT INTO public.oculto_play_today_picks(day, item_id, position, note, created_by)
  VALUES (v_day, p_item_id, COALESCE(p_position,0), p_note, auth.uid())
  ON CONFLICT (day, item_id) DO UPDATE
    SET position = EXCLUDED.position, note = EXCLUDED.note
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_today_set(uuid,int,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_today_unset(p_item_id uuid, p_day date DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  DELETE FROM public.oculto_play_today_picks
   WHERE item_id = p_item_id
     AND day = COALESCE(p_day, (now() AT TIME ZONE 'UTC')::date);
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_today_unset(uuid,date) TO authenticated;

-- ---------- RPC: oculto_play_comeback (fallback se ainda não existe) ----------
DROP FUNCTION IF EXISTS public.oculto_play_comeback(int);
DROP FUNCTION IF EXISTS public.oculto_play_comeback(integer);
CREATE OR REPLACE FUNCTION public.oculto_play_comeback(p_limit int DEFAULT 12)
RETURNS TABLE (
  id uuid, title text, caption text, thumb_url text, media_url text,
  kind text, duration_sec int, watched_seconds int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.title, i.caption, i.thumb_url, i.media_url,
         i.kind::text,
         COALESCE(i.duration_sec, 0) AS duration_sec,
         COALESCE(MAX(v.watched_seconds), 0)::int AS watched_seconds
  FROM public.oculto_play_items i
  JOIN public.oculto_play_views v ON v.item_id = i.id
  WHERE v.user_id = auth.uid()
    AND COALESCE(v.completed, false) = false
    AND COALESCE(v.watched_seconds,0) > 3
  GROUP BY i.id
  ORDER BY MAX(v.created_at) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit,12), 50))
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_comeback(int) TO authenticated;

-- ---------- RPCs: Return hooks (user side) ----------
CREATE OR REPLACE FUNCTION public.oculto_return_hooks_list(p_limit int DEFAULT 8)
RETURNS SETOF public.oculto_return_hooks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.oculto_return_hooks
   WHERE user_id = auth.uid()
     AND status IN ('pending','seen')
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY priority DESC, created_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit,8), 50))
$$;
GRANT EXECUTE ON FUNCTION public.oculto_return_hooks_list(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_return_hooks_dismiss(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.oculto_return_hooks
     SET status = 'dismissed', updated_at = now()
   WHERE id = p_id AND user_id = auth.uid();
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_return_hooks_dismiss(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_return_hooks_mark_seen(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.oculto_return_hooks
     SET status = CASE WHEN status = 'pending' THEN 'seen' ELSE status END,
         updated_at = now()
   WHERE id = p_id AND user_id = auth.uid();
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_return_hooks_mark_seen(uuid) TO authenticated;

-- ---------- Helper interno para inserir hooks sem duplicar ----------
CREATE OR REPLACE FUNCTION public._oculto_hook_upsert(
  p_user uuid, p_type text, p_title text, p_desc text,
  p_link text, p_item uuid, p_priority int, p_expires_in interval
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  -- Janela anti-spam: 1 hook do mesmo tipo+item por 6h
  IF EXISTS (
    SELECT 1 FROM public.oculto_return_hooks
     WHERE user_id = p_user AND hook_type = p_type
       AND COALESCE(item_id::text,'') = COALESCE(p_item::text,'')
       AND status IN ('pending','seen')
       AND created_at > now() - interval '6 hours'
  ) THEN RETURN; END IF;

  INSERT INTO public.oculto_return_hooks(
    user_id, hook_type, title, description, link, item_id, priority, expires_at
  ) VALUES (
    p_user, p_type, p_title, p_desc, p_link, p_item, COALESCE(p_priority,0),
    CASE WHEN p_expires_in IS NULL THEN NULL ELSE now() + p_expires_in END
  );
END $$;

-- ---------- Trigger: curtidas em conteúdo do usuário ----------
CREATE OR REPLACE FUNCTION public.tg_oculto_hook_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author uuid; v_title text;
BEGIN
  SELECT author_id, COALESCE(title, caption, 'seu conteúdo')
    INTO v_author, v_title
    FROM public.oculto_play_items WHERE id = NEW.item_id;
  IF v_author IS NULL OR v_author = NEW.user_id THEN RETURN NEW; END IF;
  PERFORM public._oculto_hook_upsert(
    v_author, 'content_liked',
    'Seu conteúdo recebeu novas curtidas',
    'Alguém curtiu: ' || COALESCE(v_title,''),
    '/play/p/' || NEW.item_id::text,
    NEW.item_id, 2, interval '7 days'
  );
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='oculto_play_likes') THEN
    DROP TRIGGER IF EXISTS trg_oculto_hook_like ON public.oculto_play_likes;
    CREATE TRIGGER trg_oculto_hook_like AFTER INSERT ON public.oculto_play_likes
      FOR EACH ROW EXECUTE FUNCTION public.tg_oculto_hook_on_like();
  END IF;
END $$;

-- ---------- Trigger: salvos em conteúdo do usuário ----------
CREATE OR REPLACE FUNCTION public.tg_oculto_hook_on_save()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author uuid; v_title text;
BEGIN
  SELECT author_id, COALESCE(title, caption, 'seu conteúdo')
    INTO v_author, v_title
    FROM public.oculto_play_items WHERE id = NEW.item_id;
  IF v_author IS NULL OR v_author = NEW.user_id THEN RETURN NEW; END IF;
  PERFORM public._oculto_hook_upsert(
    v_author, 'content_saved',
    'Seu conteúdo foi salvo',
    'Alguém adicionou aos salvos: ' || COALESCE(v_title,''),
    '/play/p/' || NEW.item_id::text,
    NEW.item_id, 2, interval '7 days'
  );
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='oculto_play_saves') THEN
    DROP TRIGGER IF EXISTS trg_oculto_hook_save ON public.oculto_play_saves;
    CREATE TRIGGER trg_oculto_hook_save AFTER INSERT ON public.oculto_play_saves
      FOR EACH ROW EXECUTE FUNCTION public.tg_oculto_hook_on_save();
  END IF;
END $$;

-- ---------- Trigger: resposta a comentário do usuário ----------
CREATE OR REPLACE FUNCTION public.tg_oculto_hook_on_comment_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parent_user uuid; v_title text;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO v_parent_user FROM public.oculto_play_comments WHERE id = NEW.parent_id;
  IF v_parent_user IS NULL OR v_parent_user = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(title, caption, 'um conteúdo') INTO v_title
    FROM public.oculto_play_items WHERE id = NEW.item_id;
  PERFORM public._oculto_hook_upsert(
    v_parent_user, 'comment_reply',
    'Responderam seu comentário',
    'Em: ' || COALESCE(v_title,''),
    '/play/p/' || NEW.item_id::text,
    NEW.item_id, 3, interval '7 days'
  );
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='oculto_play_comments')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='oculto_play_comments' AND column_name='parent_id') THEN
    DROP TRIGGER IF EXISTS trg_oculto_hook_comment_reply ON public.oculto_play_comments;
    CREATE TRIGGER trg_oculto_hook_comment_reply AFTER INSERT ON public.oculto_play_comments
      FOR EACH ROW EXECUTE FUNCTION public.tg_oculto_hook_on_comment_reply();
  END IF;
END $$;

-- ---------- Updated_at trigger ----------
CREATE OR REPLACE FUNCTION public.tg_oculto_return_hooks_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_oculto_return_hooks_updated ON public.oculto_return_hooks;
CREATE TRIGGER trg_oculto_return_hooks_updated BEFORE UPDATE ON public.oculto_return_hooks
  FOR EACH ROW EXECUTE FUNCTION public.tg_oculto_return_hooks_updated();
