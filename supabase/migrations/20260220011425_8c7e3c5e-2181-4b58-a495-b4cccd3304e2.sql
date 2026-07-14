
-- ─── Perfect Pair: Mutual Match Detection + Auto Conversation ────────────────
-- Function: called whenever a like/super_like is inserted into perfect_pair_actions.
-- Checks if target already liked back → mutual match → creates conversation + system message + notifications.

CREATE OR REPLACE FUNCTION public.handle_perfect_pair_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Only process likes/super_likes
  IF NEW.action_type NOT IN ('like', 'super_like') THEN
    RETURN NEW;
  END IF;

  -- Check if the target already liked the user back
  SELECT EXISTS (
    SELECT 1 FROM public.perfect_pair_actions
    WHERE user_id   = NEW.target_id
      AND target_id = NEW.user_id
      AND action_type IN ('like', 'super_like')
  ) INTO v_reverse_exists;

  IF NOT v_reverse_exists THEN
    RETURN NEW; -- No mutual match yet
  END IF;

  -- ── Fetch profile data for both sides ──────────────────────────────────────
  SELECT user_id, name, avatar_url
    INTO v_user_auth_id, v_user_name, v_user_avatar
    FROM public.profiles WHERE id = NEW.user_id;

  SELECT user_id, name, avatar_url
    INTO v_target_auth_id, v_target_name, v_target_avatar
    FROM public.profiles WHERE id = NEW.target_id;

  -- ── Get or create conversation ─────────────────────────────────────────────
  -- Try finding existing conversation between the two auth users
  SELECT cp1.conversation_id INTO v_conversation_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = v_user_auth_id
      AND cp2.user_id = v_target_auth_id
    LIMIT 1;

  IF v_conversation_id IS NULL THEN
    -- Create new conversation
    INSERT INTO public.conversations (created_at, updated_at)
    VALUES (NOW(), NOW())
    RETURNING id INTO v_conversation_id;

    -- Add both participants
    INSERT INTO public.conversation_participants (conversation_id, user_id, joined_at)
    VALUES
      (v_conversation_id, v_user_auth_id,   NOW()),
      (v_conversation_id, v_target_auth_id, NOW())
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── System welcome message ─────────────────────────────────────────────────
  -- Only insert if the conversation has no messages yet (avoid duplicates)
  IF NOT EXISTS (
    SELECT 1 FROM public.messages WHERE conversation_id = v_conversation_id LIMIT 1
  ) THEN
    INSERT INTO public.messages (
      conversation_id, sender_id, content, message_type, created_at
    ) VALUES (
      v_conversation_id,
      v_user_auth_id,  -- sender is the one who triggered the match
      '💕 Vocês deram match no Perfect Pair! Que tal dar o primeiro passo?',
      'system',
      NOW()
    );
  END IF;

  -- ── Notifications ──────────────────────────────────────────────────────────
  -- For the current user (NEW.user_id side) → notify via auth user_id
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

  -- For the target user
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
$$;

-- Drop old trigger if exists, recreate
DROP TRIGGER IF EXISTS trg_perfect_pair_match ON public.perfect_pair_actions;

CREATE TRIGGER trg_perfect_pair_match
  AFTER INSERT OR UPDATE ON public.perfect_pair_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_perfect_pair_match();

-- ── Ensure conversations & messages tables have updated_at auto-update ───────
-- (safe to run even if trigger already exists)
CREATE OR REPLACE FUNCTION public.update_conversations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_conversation_ts ON public.messages;
CREATE TRIGGER trg_update_conversation_ts
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversations_updated_at();
