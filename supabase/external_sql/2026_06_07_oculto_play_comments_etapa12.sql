-- ============================================================================
-- OCULTO PLAY — Etapa 12: Comentários nos itens
-- 100% idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- Depende de: oculto_play_items, profiles, has_role(), can_access_oculto_play().
-- ============================================================================

-- ---------- 1) Tabela ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL, -- = auth.users.id (NÃO profiles.id, pra simplificar gate)
  body        text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 500),
  is_hidden   boolean NOT NULL DEFAULT false,
  hidden_reason text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_play_comments_item       ON public.oculto_play_comments(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_comments_author     ON public.oculto_play_comments(author_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_comments TO authenticated;
GRANT ALL ON public.oculto_play_comments TO service_role;

ALTER TABLE public.oculto_play_comments ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer logado que passe pelo gate Play
DROP POLICY IF EXISTS play_comments_read ON public.oculto_play_comments;
CREATE POLICY play_comments_read
  ON public.oculto_play_comments
  FOR SELECT
  TO authenticated
  USING (public.can_access_oculto_play());

-- Insert: precisa ser o próprio autor + passar pelo gate
DROP POLICY IF EXISTS play_comments_insert ON public.oculto_play_comments;
CREATE POLICY play_comments_insert
  ON public.oculto_play_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.can_access_oculto_play()
  );

-- Update/Delete: o autor OU admin_master
DROP POLICY IF EXISTS play_comments_update ON public.oculto_play_comments;
CREATE POLICY play_comments_update
  ON public.oculto_play_comments
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin_master'));

DROP POLICY IF EXISTS play_comments_delete ON public.oculto_play_comments;
CREATE POLICY play_comments_delete
  ON public.oculto_play_comments
  FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin_master'));

-- ---------- 2) Coluna de contagem em oculto_play_items + manutenção ----------
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS comment_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.oculto_play_comments_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT NEW.is_hidden THEN
    UPDATE public.oculto_play_items
       SET comment_count = comment_count + 1
     WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' AND NOT OLD.is_hidden THEN
    UPDATE public.oculto_play_items
       SET comment_count = GREATEST(0, comment_count - 1)
     WHERE id = OLD.item_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_hidden IS DISTINCT FROM NEW.is_hidden THEN
    IF NEW.is_hidden THEN
      UPDATE public.oculto_play_items
         SET comment_count = GREATEST(0, comment_count - 1)
       WHERE id = NEW.item_id;
    ELSE
      UPDATE public.oculto_play_items
         SET comment_count = comment_count + 1
       WHERE id = NEW.item_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_play_comments_count ON public.oculto_play_comments;
CREATE TRIGGER trg_play_comments_count
AFTER INSERT OR UPDATE OR DELETE ON public.oculto_play_comments
FOR EACH ROW EXECUTE FUNCTION public.oculto_play_comments_bump();

-- ---------- 3) RPC: listar com autor enriquecido ----------
CREATE OR REPLACE FUNCTION public.oculto_play_comments_list(
  p_item_id uuid,
  p_limit   int DEFAULT 50,
  p_before  timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  item_id      uuid,
  author_id    uuid,
  body         text,
  is_hidden    boolean,
  created_at   timestamptz,
  author_username     text,
  author_display_name text,
  author_avatar_url   text,
  mine         boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_oculto_play() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.item_id, c.author_id, c.body, c.is_hidden, c.created_at,
         p.username, p.display_name, p.avatar_url,
         (c.author_id = auth.uid()) AS mine
    FROM public.oculto_play_comments c
    LEFT JOIN public.profiles p ON p.user_id = c.author_id
   WHERE c.item_id = p_item_id
     AND (NOT c.is_hidden OR c.author_id = auth.uid() OR public.has_role(auth.uid(),'admin_master'))
     AND (p_before IS NULL OR c.created_at < p_before)
   ORDER BY c.created_at DESC
   LIMIT GREATEST(1, LEAST(p_limit, 100));
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_comments_list(uuid,int,timestamptz) TO authenticated;

-- ---------- 4) RPC: adicionar comentário (idempotente p/ deduplicação curta) ----------
CREATE OR REPLACE FUNCTION public.oculto_play_comments_add(
  p_item_id uuid,
  p_body    text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id   uuid;
  v_body text := btrim(coalesce(p_body,''));
BEGIN
  IF NOT public.can_access_oculto_play() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF length(v_body) < 1 OR length(v_body) > 500 THEN
    RAISE EXCEPTION 'invalid body length';
  END IF;

  -- dedup curtíssimo (mesmo texto no mesmo item nos últimos 15s)
  SELECT id INTO v_id
    FROM public.oculto_play_comments
   WHERE item_id = p_item_id
     AND author_id = auth.uid()
     AND body = v_body
     AND created_at > now() - interval '15 seconds'
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.oculto_play_comments(item_id, author_id, body)
  VALUES (p_item_id, auth.uid(), v_body)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_comments_add(uuid,text) TO authenticated;

-- ---------- 5) RPC: moderar (Master) — ocultar/restaurar/apagar ----------
CREATE OR REPLACE FUNCTION public.oculto_play_comments_moderate(
  p_comment_id uuid,
  p_action     text,            -- 'hide' | 'restore' | 'delete'
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_action = 'hide' THEN
    UPDATE public.oculto_play_comments
       SET is_hidden = true, hidden_reason = coalesce(p_reason,'moderation')
     WHERE id = p_comment_id;
  ELSIF p_action = 'restore' THEN
    UPDATE public.oculto_play_comments
       SET is_hidden = false, hidden_reason = NULL
     WHERE id = p_comment_id;
  ELSIF p_action = 'delete' THEN
    DELETE FROM public.oculto_play_comments WHERE id = p_comment_id;
  ELSE
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', p_action, 'id', p_comment_id);
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_comments_moderate(uuid,text,text) TO authenticated;

-- ---------- 6) Reconciliar contagem (se já existirem comentários) ----------
UPDATE public.oculto_play_items i
   SET comment_count = sub.cnt
  FROM (
    SELECT item_id, count(*)::int AS cnt
      FROM public.oculto_play_comments
     WHERE NOT is_hidden
     GROUP BY item_id
  ) sub
 WHERE sub.item_id = i.id
   AND i.comment_count IS DISTINCT FROM sub.cnt;

NOTIFY pgrst, 'reload schema';
