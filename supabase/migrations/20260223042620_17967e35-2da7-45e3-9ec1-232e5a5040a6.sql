
-- Fix the handle_perfect_pair_match trigger function
-- The messages table does not have a "message_type" column, remove it from the INSERT
CREATE OR REPLACE FUNCTION public.handle_perfect_pair_match()
RETURNS TRIGGER AS $$
DECLARE
  v_reverse_exists   BOOLEAN;
  v_conversation_id  UUID;
  v_user_auth_id     UUID;
  v_target_auth_id   UUID;
  v_user_name        TEXT;
  v_target_name      TEXT;
  v_user_avatar      TEXT;
  v_target_avatar    TEXT;
BEGIN
  IF NEW.action_type NOT IN ('like', 'super_like') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.perfect_pair_actions
    WHERE user_id   = NEW.target_id
      AND target_id = NEW.user_id
      AND action_type IN ('like', 'super_like')
  ) INTO v_reverse_exists;

  IF NOT v_reverse_exists THEN
    RETURN NEW;
  END IF;

  SELECT user_id, name, avatar_url
    INTO v_user_auth_id, v_user_name, v_user_avatar
    FROM public.profiles WHERE id = NEW.user_id;

  SELECT user_id, name, avatar_url
    INTO v_target_auth_id, v_target_name, v_target_avatar
    FROM public.profiles WHERE id = NEW.target_id;

  SELECT cp1.conversation_id INTO v_conversation_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = v_user_auth_id
      AND cp2.user_id = v_target_auth_id
    LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (created_at, updated_at)
    VALUES (NOW(), NOW())
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.conversation_participants (conversation_id, user_id, joined_at)
    VALUES
      (v_conversation_id, v_user_auth_id,   NOW()),
      (v_conversation_id, v_target_auth_id, NOW())
    ON CONFLICT DO NOTHING;
  END IF;

  -- System welcome message WITHOUT message_type (column does not exist)
  IF NOT EXISTS (
    SELECT 1 FROM public.messages WHERE conversation_id = v_conversation_id LIMIT 1
  ) THEN
    INSERT INTO public.messages (
      conversation_id, sender_id, content, created_at
    ) VALUES (
      v_conversation_id,
      v_user_auth_id,
      '💕 Vocês deram match no Perfect Pair! Que tal dar o primeiro passo?',
      NOW()
    );
  END IF;

  INSERT INTO public.notifications (
    user_id, type, title, body, data, is_read, created_at
  ) VALUES (
    v_user_auth_id,
    'looking_now_match',
    'Perfect Pair! 💕',
    v_target_name || ' também curtiu você!',
    jsonb_build_object(
      'pair_user_id',     NEW.target_id,
      'pair_user_avatar', v_target_avatar,
      'conversation_id',  v_conversation_id
    ),
    FALSE,
    NOW()
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (
    user_id, type, title, body, data, is_read, created_at
  ) VALUES (
    v_target_auth_id,
    'looking_now_match',
    'Perfect Pair! 💕',
    v_user_name || ' também curtiu você!',
    jsonb_build_object(
      'pair_user_id',     NEW.user_id,
      'pair_user_avatar', v_user_avatar,
      'conversation_id',  v_conversation_id
    ),
    FALSE,
    NOW()
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
