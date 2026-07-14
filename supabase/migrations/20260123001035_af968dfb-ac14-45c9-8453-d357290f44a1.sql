-- Criar tabela de comentários
CREATE TABLE public.post_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_seed BOOLEAN DEFAULT false
);

-- Habilitar RLS
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Qualquer um pode ver comentários"
  ON post_comments FOR SELECT USING (true);

CREATE POLICY "Usuários podem criar comentários"
  ON post_comments FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Usuários podem deletar próprios comentários"
  ON post_comments FOR DELETE
  USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;

-- Trigger para atualizar comments_count automaticamente
CREATE OR REPLACE FUNCTION public.update_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trigger_update_comments_count
AFTER INSERT OR DELETE ON post_comments
FOR EACH ROW
EXECUTE FUNCTION update_comments_count();

-- Função para gerar comentários seed (ignora RLS)
CREATE OR REPLACE FUNCTION public.generate_seed_comments(comments_data jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'Apenas admin_master pode gerar comentários seed';
  END IF;

  INSERT INTO post_comments (post_id, user_id, content, is_seed)
  SELECT 
    (c->>'post_id')::uuid,
    (c->>'user_id')::uuid,
    c->>'content',
    true
  FROM jsonb_array_elements(comments_data) AS c;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

-- Atualizar função de purge para incluir comentários
CREATE OR REPLACE FUNCTION public.purge_seed_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_profiles integer;
  deleted_posts integer;
  deleted_likes integer;
  deleted_comments integer;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Delete seed comments first (trigger will update counts)
  DELETE FROM public.post_comments WHERE is_seed = true;
  GET DIAGNOSTICS deleted_comments = ROW_COUNT;

  -- Delete seed likes
  DELETE FROM public.post_likes WHERE is_seed = true;
  GET DIAGNOSTICS deleted_likes = ROW_COUNT;

  -- Delete seed posts
  DELETE FROM public.posts WHERE is_seed = true;
  GET DIAGNOSTICS deleted_posts = ROW_COUNT;

  -- Delete seed profiles
  DELETE FROM public.profiles WHERE is_seed = true;
  GET DIAGNOSTICS deleted_profiles = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_profiles', deleted_profiles,
    'deleted_posts', deleted_posts,
    'deleted_likes', deleted_likes,
    'deleted_comments', deleted_comments
  );
END;
$$;