-- Adicionar campos para respostas aninhadas e menções na tabela post_comments
ALTER TABLE public.post_comments
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS mentioned_users UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0;

-- Índice para buscar respostas de um comentário
CREATE INDEX IF NOT EXISTS idx_post_comments_parent_id ON public.post_comments(parent_id);

-- Índice para buscar menções por usuário
CREATE INDEX IF NOT EXISTS idx_post_comments_mentioned_users ON public.post_comments USING GIN(mentioned_users);

-- Trigger para notificar quando alguém comenta no post
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_post RECORD;
  v_commenter RECORD;
  v_owner RECORD;
  v_mentioned_user_id UUID;
  v_mentioned_profile RECORD;
  v_parent_author RECORD;
BEGIN
  -- Buscar informações do post
  SELECT user_id INTO v_post FROM posts WHERE id = NEW.post_id;
  
  -- Buscar perfil do comentador
  SELECT id, name, username, user_id INTO v_commenter 
  FROM profiles WHERE id = NEW.user_id;
  
  -- Buscar dono do post
  SELECT user_id INTO v_owner FROM profiles WHERE id = v_post.user_id;
  
  -- Notificar dono do post (se não for o próprio comentador)
  IF v_owner.user_id IS NOT NULL AND v_owner.user_id != v_commenter.user_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_owner.user_id,
      'comment',
      COALESCE('@' || v_commenter.username, v_commenter.name) || ' comentou em sua publicação',
      LEFT(NEW.content, 100),
      jsonb_build_object(
        'actor_id', v_commenter.id,
        'post_id', NEW.post_id,
        'comment_id', NEW.id
      )
    );
  END IF;
  
  -- Notificar usuários mencionados
  IF NEW.mentioned_users IS NOT NULL THEN
    FOREACH v_mentioned_user_id IN ARRAY NEW.mentioned_users
    LOOP
      SELECT user_id INTO v_mentioned_profile FROM profiles WHERE id = v_mentioned_user_id;
      
      IF v_mentioned_profile.user_id IS NOT NULL 
         AND v_mentioned_profile.user_id != v_commenter.user_id THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
          v_mentioned_profile.user_id,
          'mention',
          COALESCE('@' || v_commenter.username, v_commenter.name) || ' mencionou você em um comentário',
          LEFT(NEW.content, 100),
          jsonb_build_object(
            'actor_id', v_commenter.id,
            'post_id', NEW.post_id,
            'comment_id', NEW.id
          )
        );
      END IF;
    END LOOP;
  END IF;
  
  -- Se for resposta a outro comentário, notificar autor original
  IF NEW.parent_id IS NOT NULL THEN
    SELECT p.user_id INTO v_parent_author
    FROM post_comments pc
    JOIN profiles p ON pc.user_id = p.id
    WHERE pc.id = NEW.parent_id;
    
    IF v_parent_author.user_id IS NOT NULL 
       AND v_parent_author.user_id != v_commenter.user_id THEN
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        v_parent_author.user_id,
        'reply',
        COALESCE('@' || v_commenter.username, v_commenter.name) || ' respondeu seu comentário',
        LEFT(NEW.content, 100),
        jsonb_build_object(
          'actor_id', v_commenter.id,
          'post_id', NEW.post_id,
          'comment_id', NEW.id,
          'parent_comment_id', NEW.parent_id
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_notify_on_comment ON public.post_comments;

-- Criar trigger
CREATE TRIGGER trigger_notify_on_comment
AFTER INSERT ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();