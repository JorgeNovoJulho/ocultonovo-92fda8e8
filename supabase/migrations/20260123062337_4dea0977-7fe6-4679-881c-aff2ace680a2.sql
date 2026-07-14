-- Fix function search path for security
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;