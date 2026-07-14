
-- Corrige a função do trigger para usar corretamente os IDs
-- follows.follower_id e follows.following_id são PROFILE IDs (profiles.id)
-- notifications.user_id precisa de AUTH USER ID (auth.users.id via profiles.user_id)

CREATE OR REPLACE FUNCTION public.notify_on_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_follower_name TEXT;
  v_following_auth_uid UUID;
BEGIN
  -- Busca o nome do seguidor (follower_id é profiles.id)
  SELECT COALESCE(username, name) INTO v_follower_name 
  FROM profiles 
  WHERE id = NEW.follower_id;
  
  -- Busca o auth user_id do perfil sendo seguido (para inserir na tabela notifications)
  SELECT user_id INTO v_following_auth_uid 
  FROM profiles 
  WHERE id = NEW.following_id;
  
  -- Só cria notificação se não for auto-follow e se encontrou o auth uid
  IF NEW.following_id != NEW.follower_id AND v_following_auth_uid IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_following_auth_uid,
      'follow',
      '@' || COALESCE(v_follower_name, 'Alguém') || ' começou a te seguir',
      NULL,
      jsonb_build_object('actor_id', NEW.follower_id)
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca falha o follow por causa da notificação
  RETURN NEW;
END;
$$;

-- Garante que o trigger existe e está ativo
DROP TRIGGER IF EXISTS trigger_notify_new_follower ON public.follows;

CREATE TRIGGER trigger_notify_new_follower
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_new_follower();
