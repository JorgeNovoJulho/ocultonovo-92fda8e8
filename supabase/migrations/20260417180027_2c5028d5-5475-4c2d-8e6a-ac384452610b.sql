-- Corrigir o trigger notify_on_new_follower que tenta inserir actor_id como coluna
-- A tabela notifications não tem coluna actor_id; o ID do ator deve ir no campo JSON 'data'

CREATE OR REPLACE FUNCTION public.notify_on_new_follower()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id uuid;
  v_actor_user_id uuid;
  v_actor_name text;
  v_actor_username text;
BEGIN
  -- Buscar user_id do alvo (quem está sendo seguido)
  SELECT user_id INTO v_target_user_id
  FROM public.profiles
  WHERE id = NEW.following_id;

  -- Buscar dados do ator (quem seguiu)
  SELECT user_id, name, username
  INTO v_actor_user_id, v_actor_name, v_actor_username
  FROM public.profiles
  WHERE id = NEW.follower_id;

  IF v_target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Inserir notificação SEM a coluna actor_id (apenas dentro de data)
  INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
  VALUES (
    v_target_user_id,
    'follow',
    COALESCE('@' || v_actor_username, v_actor_name, 'Alguém') || ' começou a te seguir',
    NULL,
    jsonb_build_object(
      'actor_id', NEW.follower_id,
      'actor_user_id', v_actor_user_id,
      'actor_name', v_actor_name,
      'actor_username', v_actor_username
    ),
    false
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Não bloquear o follow se a notificação falhar
  RETURN NEW;
END;
$$;