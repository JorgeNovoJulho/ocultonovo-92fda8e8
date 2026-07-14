
-- 1) Corrigir RLS de post_likes (user_id = profile.id, não auth.uid)
DROP POLICY IF EXISTS "Authenticated users can like posts" ON public.post_likes;
DROP POLICY IF EXISTS "Authenticated users can unlike posts" ON public.post_likes;

CREATE POLICY "Users can like posts via their profile"
ON public.post_likes
FOR INSERT
TO authenticated
WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can unlike their own likes"
ON public.post_likes
FOR DELETE
TO authenticated
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- 2) Replicar correção em post_dislikes (mesma estrutura)
DO $$
DECLARE
  v_fk_target text;
BEGIN
  SELECT confrelid::regclass::text INTO v_fk_target
  FROM pg_constraint
  WHERE conrelid = 'public.post_dislikes'::regclass
    AND contype = 'f'
    AND 'user_id' = ANY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = conrelid AND a.attnum = ANY(conkey))
  LIMIT 1;

  IF v_fk_target = 'profiles' THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can dislike posts" ON public.post_dislikes';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can remove dislike" ON public.post_dislikes';
    EXECUTE $p$CREATE POLICY "Users can dislike via profile" ON public.post_dislikes FOR INSERT TO authenticated WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "Users can remove own dislike" ON public.post_dislikes FOR DELETE TO authenticated USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))$p$;
  END IF;
END $$;

-- 3) Trigger de auto-like (compara profile.id == profile.id)
CREATE OR REPLACE FUNCTION public.prevent_self_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_profile_id uuid;
BEGIN
  SELECT user_id INTO v_owner_profile_id FROM public.posts WHERE id = NEW.post_id;
  IF v_owner_profile_id IS NOT NULL AND v_owner_profile_id = NEW.user_id THEN
    RAISE EXCEPTION 'Você não pode curtir suas próprias publicações';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_like ON public.post_likes;
CREATE TRIGGER trg_prevent_self_like
BEFORE INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_like();

-- 4) Garantir trigger de notificação está ativo (já existe notify_on_post_like) — recria por segurança
DROP TRIGGER IF EXISTS trg_notify_on_post_like ON public.post_likes;
CREATE TRIGGER trg_notify_on_post_like
AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_like();
