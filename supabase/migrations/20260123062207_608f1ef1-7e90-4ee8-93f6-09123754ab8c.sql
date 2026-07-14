-- Tabela para armazenar histórico de edições de comentários
CREATE TABLE IF NOT EXISTS public.comment_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  previous_content TEXT NOT NULL,
  edited_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  edited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Índice para busca rápida por comentário
CREATE INDEX idx_comment_edit_history_comment_id 
ON public.comment_edit_history(comment_id);

-- Habilitar RLS
ALTER TABLE public.comment_edit_history ENABLE ROW LEVEL SECURITY;

-- Admins podem ver todo o histórico (para moderação)
CREATE POLICY "Admins can view all edit history"
ON public.comment_edit_history FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Autor do comentário pode ver seu próprio histórico
CREATE POLICY "Users can view their own edit history"
ON public.comment_edit_history FOR SELECT
TO authenticated
USING (
  edited_by IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
);

-- Sistema pode inserir histórico (via trigger)
CREATE POLICY "System can insert edit history"
ON public.comment_edit_history FOR INSERT
TO authenticated
WITH CHECK (true);

-- Trigger para salvar automaticamente o conteúdo anterior
CREATE OR REPLACE FUNCTION save_comment_edit_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Só salvar se o conteúdo realmente mudou
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO public.comment_edit_history (comment_id, previous_content, edited_by)
    VALUES (OLD.id, OLD.content, OLD.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_save_comment_edit_history
BEFORE UPDATE OF content ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION save_comment_edit_history();