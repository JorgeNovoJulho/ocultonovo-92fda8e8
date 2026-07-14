-- Add auto-reply fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS super_dm_auto_reply_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS super_dm_auto_reply_message text DEFAULT 'Obrigado pelo Super DM! 💫 Vou responder o mais breve possível.',
ADD COLUMN IF NOT EXISTS super_dm_estimated_response_hours integer DEFAULT 24;

-- Add is_auto_reply field to messages
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_auto_reply boolean DEFAULT false;

-- Update send_super_dm function to include auto-reply
CREATE OR REPLACE FUNCTION public.send_super_dm(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_receiver_id uuid,
  p_content text,
  p_amount numeric,
  p_media_url text DEFAULT NULL,
  p_media_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_credits numeric;
  v_message_id uuid;
  v_auto_reply_id uuid;
  v_receiver_profile record;
  v_sender_name text;
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor deve ser maior que zero');
  END IF;

  -- Get sender credits and name
  SELECT credits, name INTO v_sender_credits, v_sender_name
  FROM profiles WHERE id = p_sender_id;
  
  IF v_sender_credits IS NULL OR v_sender_credits < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Créditos insuficientes');
  END IF;

  -- Get receiver profile for auto-reply settings
  SELECT 
    id as user_id,
    min_super_dm_price,
    super_dm_auto_reply_enabled,
    super_dm_auto_reply_message,
    super_dm_estimated_response_hours
  INTO v_receiver_profile
  FROM profiles WHERE id = p_receiver_id;
  
  -- Validate minimum price
  IF v_receiver_profile.min_super_dm_price IS NOT NULL AND p_amount < v_receiver_profile.min_super_dm_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor abaixo do mínimo aceito');
  END IF;

  -- Debit sender credits
  UPDATE profiles 
  SET credits = credits - p_amount,
      updated_at = now()
  WHERE id = p_sender_id;

  -- Credit receiver (90% goes to creator, 10% platform fee)
  UPDATE profiles 
  SET balance = COALESCE(balance, 0) + (p_amount * 0.9),
      super_dm_earnings = COALESCE(super_dm_earnings, 0) + (p_amount * 0.9),
      updated_at = now()
  WHERE id = p_receiver_id;

  -- Insert priority message
  INSERT INTO messages (
    conversation_id,
    sender_id,
    content,
    media_url,
    media_type,
    is_priority,
    priority_amount,
    priority_paid_at
  ) VALUES (
    p_conversation_id,
    p_sender_id,
    p_content,
    p_media_url,
    p_media_type,
    true,
    p_amount,
    now()
  ) RETURNING id INTO v_message_id;

  -- Update conversation participants for priority sorting
  UPDATE conversation_participants
  SET has_unread_priority = true,
      total_priority_amount = COALESCE(total_priority_amount, 0) + p_amount,
      priority_responded = false,
      updated_at = now()
  WHERE conversation_id = p_conversation_id 
    AND user_id = p_receiver_id;

  -- Record transaction for sender (debit)
  INSERT INTO transactions (user_id, amount, type, status, description)
  VALUES (p_sender_id, -p_amount, 'tip', 'completed', 'Super DM enviado');

  -- Record transaction for receiver (credit)
  INSERT INTO transactions (user_id, amount, type, status, description)
  VALUES (p_receiver_id, p_amount * 0.9, 'tip', 'completed', 'Super DM recebido de ' || COALESCE(v_sender_name, 'usuário'));

  -- Record in priority_message_transactions
  INSERT INTO priority_message_transactions (
    message_id, sender_id, receiver_id, amount, net_amount
  ) VALUES (
    v_message_id, p_sender_id, p_receiver_id, p_amount, p_amount * 0.9
  );

  -- Send auto-reply if enabled
  IF v_receiver_profile.super_dm_auto_reply_enabled AND v_receiver_profile.super_dm_auto_reply_message IS NOT NULL THEN
    INSERT INTO messages (
      conversation_id,
      sender_id,
      content,
      is_auto_reply
    ) VALUES (
      p_conversation_id,
      p_receiver_id,
      v_receiver_profile.super_dm_auto_reply_message || 
        E'\n\n⏱️ Tempo estimado de resposta: ' || 
        COALESCE(v_receiver_profile.super_dm_estimated_response_hours, 24) || ' horas',
      true
    ) RETURNING id INTO v_auto_reply_id;
  END IF;

  -- Create notification for receiver
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    p_receiver_id,
    'super_dm',
    '💎 Super DM Recebido!',
    COALESCE(v_sender_name, 'Alguém') || ' enviou um Super DM de ' || p_amount || ' créditos',
    jsonb_build_object('message_id', v_message_id, 'sender_id', p_sender_id, 'amount', p_amount)
  );

  RETURN jsonb_build_object(
    'success', true, 
    'message_id', v_message_id,
    'auto_reply_sent', v_receiver_profile.super_dm_auto_reply_enabled
  );
END;
$$;