-- =============================================================
-- Oculto PLAY — Engajamento v2
-- Dislikes, Shares únicos por user, RPCs em lote, Notificações
-- para o criador e Realtime nos contadores.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =============================================================

-- 1) Dislikes -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_play_dislikes (
  item_id    uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_op_dislikes_item ON public.oculto_play_dislikes (item_id);
GRANT SELECT, INSERT, DELETE ON public.oculto_play_dislikes TO authenticated;
GRANT ALL ON public.oculto_play_dislikes TO service_role;
ALTER TABLE public.oculto_play_dislikes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "op_dislikes_self" ON public.oculto_play_dislikes;
CREATE POLICY "op_dislikes_self" ON public.oculto_play_dislikes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS dislike_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.tg_op_dislikes_counter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.oculto_play_items SET dislike_count = dislike_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.oculto_play_items SET dislike_count = GREATEST(0, dislike_count - 1) WHERE id = OLD.item_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_op_dislikes_counter ON public.oculto_play_dislikes;
CREATE TRIGGER trg_op_dislikes_counter
  AFTER INSERT OR DELETE ON public.oculto_play_dislikes
  FOR EACH ROW EXECUTE FUNCTION public.tg_op_dislikes_counter();

-- 2) Shares (1 por user, incrementa share_count) --------------
CREATE TABLE IF NOT EXISTS public.oculto_play_shares (
  item_id    uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_op_shares_item ON public.oculto_play_shares (item_id);
GRANT SELECT, INSERT ON public.oculto_play_shares TO authenticated;
GRANT ALL ON public.oculto_play_shares TO service_role;
ALTER TABLE public.oculto_play_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "op_shares_self" ON public.oculto_play_shares;
CREATE POLICY "op_shares_self" ON public.oculto_play_shares
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_op_shares_counter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.oculto_play_items SET share_count = share_count + 1 WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_op_shares_counter ON public.oculto_play_shares;
CREATE TRIGGER trg_op_shares_counter
  AFTER INSERT ON public.oculto_play_shares
  FOR EACH ROW EXECUTE FUNCTION public.tg_op_shares_counter();

-- 3) RPCs -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_toggle_dislike(p_item_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_play_dislikes
     WHERE item_id = p_item_id AND user_id = auth.uid()
  ) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.oculto_play_dislikes WHERE item_id=p_item_id AND user_id=auth.uid();
    RETURN false;
  ELSE
    INSERT INTO public.oculto_play_dislikes (item_id, user_id)
    VALUES (p_item_id, auth.uid()) ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_toggle_dislike(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_register_share(p_item_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  INSERT INTO public.oculto_play_shares (item_id, user_id)
  VALUES (p_item_id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_register_share(uuid) TO authenticated;

-- 4) Reações do usuário em lote (liked/saved/disliked/shared) -
CREATE OR REPLACE FUNCTION public.oculto_play_my_reactions(p_item_ids uuid[])
RETURNS TABLE(item_id uuid, liked boolean, saved boolean, disliked boolean, shared boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i AS item_id,
    EXISTS (SELECT 1 FROM public.oculto_play_likes    l  WHERE l.item_id=i  AND l.user_id  = auth.uid()) AS liked,
    EXISTS (SELECT 1 FROM public.oculto_play_saves    s  WHERE s.item_id=i  AND s.user_id  = auth.uid()) AS saved,
    EXISTS (SELECT 1 FROM public.oculto_play_dislikes d  WHERE d.item_id=i  AND d.user_id  = auth.uid()) AS disliked,
    EXISTS (SELECT 1 FROM public.oculto_play_shares   sh WHERE sh.item_id=i AND sh.user_id = auth.uid()) AS shared
  FROM unnest(p_item_ids) AS i;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_my_reactions(uuid[]) TO authenticated;

-- 5) Contagens em lote (com dislike_count) --------------------
CREATE OR REPLACE FUNCTION public.oculto_play_item_counts(p_item_ids uuid[])
RETURNS TABLE(item_id uuid, view_count int, like_count int, dislike_count int, save_count int, share_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, view_count, like_count, dislike_count, save_count, share_count
  FROM public.oculto_play_items
  WHERE id = ANY(p_item_ids);
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_item_counts(uuid[]) TO authenticated;

-- 6) Notificações ao criador ---------------------------------
CREATE OR REPLACE FUNCTION public.tg_op_notify_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item RECORD;
  v_author_user uuid;
  v_actor_username text;
  v_type text;
  v_title text;
  v_body text;
BEGIN
  SELECT i.id, i.author_id INTO v_item
    FROM public.oculto_play_items i WHERE i.id = NEW.item_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT p.user_id INTO v_author_user
    FROM public.profiles p WHERE p.id = v_item.author_id;
  IF v_author_user IS NULL OR v_author_user = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.username, p.display_name, 'alguém')
    INTO v_actor_username
    FROM public.profiles p WHERE p.user_id = NEW.user_id;

  IF TG_TABLE_NAME = 'oculto_play_likes' THEN
    v_type := 'play_like';
    v_title := 'Nova curtida no PLAY';
    v_body  := '@' || COALESCE(v_actor_username,'alguém') || ' curtiu sua publicação.';
  ELSIF TG_TABLE_NAME = 'oculto_play_dislikes' THEN
    v_type := 'play_dislike';
    v_title := 'Reação no PLAY';
    v_body  := '@' || COALESCE(v_actor_username,'alguém') || ' reagiu à sua publicação.';
  ELSIF TG_TABLE_NAME = 'oculto_play_saves' THEN
    v_type := 'play_save';
    v_title := 'Salvaram seu PLAY';
    v_body  := '@' || COALESCE(v_actor_username,'alguém') || ' salvou sua publicação.';
  ELSIF TG_TABLE_NAME = 'oculto_play_shares' THEN
    v_type := 'play_share';
    v_title := 'Compartilharam seu PLAY';
    v_body  := '@' || COALESCE(v_actor_username,'alguém') || ' compartilhou sua publicação.';
  ELSE
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, data, is_read)
    VALUES (
      v_author_user, NEW.user_id, v_type, v_title, v_body,
      jsonb_build_object('item_id', NEW.item_id, 'kind', 'oculto_play'),
      false
    );
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
      VALUES (
        v_author_user, v_type, v_title, v_body,
        jsonb_build_object('item_id', NEW.item_id, 'kind', 'oculto_play'),
        false
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'op notify falhou: %', SQLERRM;
    END;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_op_notify_like ON public.oculto_play_likes;
CREATE TRIGGER trg_op_notify_like
  AFTER INSERT ON public.oculto_play_likes
  FOR EACH ROW EXECUTE FUNCTION public.tg_op_notify_creator();

DROP TRIGGER IF EXISTS trg_op_notify_dislike ON public.oculto_play_dislikes;
CREATE TRIGGER trg_op_notify_dislike
  AFTER INSERT ON public.oculto_play_dislikes
  FOR EACH ROW EXECUTE FUNCTION public.tg_op_notify_creator();

DROP TRIGGER IF EXISTS trg_op_notify_save ON public.oculto_play_saves;
CREATE TRIGGER trg_op_notify_save
  AFTER INSERT ON public.oculto_play_saves
  FOR EACH ROW EXECUTE FUNCTION public.tg_op_notify_creator();

DROP TRIGGER IF EXISTS trg_op_notify_share ON public.oculto_play_shares;
CREATE TRIGGER trg_op_notify_share
  AFTER INSERT ON public.oculto_play_shares
  FOR EACH ROW EXECUTE FUNCTION public.tg_op_notify_creator();

-- 7) Realtime nos contadores ---------------------------------
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_items';
  EXCEPTION WHEN duplicate_object THEN NULL;
           WHEN others THEN RAISE WARNING 'realtime add falhou: %', SQLERRM;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
