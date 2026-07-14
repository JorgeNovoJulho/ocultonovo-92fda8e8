-- Criar tabela de likes em comentários
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(comment_id, user_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON public.comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON public.comment_likes(user_id);

-- Adicionar coluna likes_count na tabela post_comments
ALTER TABLE public.post_comments
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- RLS policies
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- Todos podem ver likes
CREATE POLICY "Anyone can view comment likes"
ON public.comment_likes FOR SELECT
USING (true);

-- Usuários autenticados podem curtir
CREATE POLICY "Authenticated users can insert comment likes"
ON public.comment_likes FOR INSERT
WITH CHECK (
  user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);

-- Usuários podem remover seus próprios likes
CREATE POLICY "Users can delete their own comment likes"
ON public.comment_likes FOR DELETE
USING (
  user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);

-- Trigger para atualizar contador de likes
CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE post_comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_comment_likes_count
AFTER INSERT OR DELETE ON public.comment_likes
FOR EACH ROW EXECUTE FUNCTION update_comment_likes_count();