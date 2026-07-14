-- =====================================================
-- SUPER DM (Priority Messages) System
-- =====================================================

-- 1. Add Super DM settings to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS accept_super_dm boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS min_super_dm_price numeric DEFAULT 5,
ADD COLUMN IF NOT EXISTS super_dm_earnings numeric DEFAULT 0;

-- 2. Add priority fields to messages
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_priority boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS priority_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS priority_paid_at timestamp with time zone;

-- 3. Add priority tracking to conversation_participants
ALTER TABLE public.conversation_participants
ADD COLUMN IF NOT EXISTS has_unread_priority boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS total_priority_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS priority_responded boolean DEFAULT false;

-- 4. Create priority message transactions table
CREATE TABLE IF NOT EXISTS public.priority_message_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  sender_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  platform_fee numeric DEFAULT 0,
  net_amount numeric NOT NULL,
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded')),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on priority_message_transactions
ALTER TABLE public.priority_message_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for priority_message_transactions
CREATE POLICY "Users can view their own priority transactions"
ON public.priority_message_transactions
FOR SELECT
USING (
  sender_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR receiver_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- 5. Create the send_super_dm function
CREATE OR REPLACE FUNCTION public.send_super_dm(
  p_conversation_id UUID,
  p_content TEXT,
  p_amount NUMERIC,
  p_media_url TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_profile_id UUID;
  v_receiver_profile_id UUID;
  v_sender_credits NUMERIC;
  v_min_price NUMERIC;
  v_accept_super_dm BOOLEAN;
  v_platform_fee NUMERIC;
  v_net_amount NUMERIC;
  v_message_id UUID;
  v_receiver_user_id UUID;
BEGIN
  -- Get sender profile
  SELECT id INTO v_sender_profile_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF v_sender_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender profile not found');
  END IF;
  
  -- Get receiver profile from conversation
  SELECT cp.profile_id INTO v_receiver_profile_id
  FROM conversation_participants cp
  WHERE cp.conversation_id = p_conversation_id
    AND cp.profile_id != v_sender_profile_id
  LIMIT 1;
  
  IF v_receiver_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receiver not found in conversation');
  END IF;
  
  -- Get sender credits
  SELECT COALESCE(credits, 0) INTO v_sender_credits
  FROM profiles
  WHERE id = v_sender_profile_id;
  
  -- Get receiver settings
  SELECT 
    COALESCE(accept_super_dm, true),
    COALESCE(min_super_dm_price, 5),
    user_id
  INTO v_accept_super_dm, v_min_price, v_receiver_user_id
  FROM profiles
  WHERE id = v_receiver_profile_id;
  
  -- Validate receiver accepts Super DM
  IF NOT v_accept_super_dm THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creator does not accept Super DM');
  END IF;
  
  -- Validate amount >= min price
  IF p_amount < v_min_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount below minimum price', 'min_price', v_min_price);
  END IF;
  
  -- Validate sender has enough credits
  IF v_sender_credits < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient credits', 'available', v_sender_credits);
  END IF;
  
  -- Calculate platform fee (10%)
  v_platform_fee := p_amount * 0.10;
  v_net_amount := p_amount - v_platform_fee;
  
  -- Debit sender credits
  UPDATE profiles
  SET credits = credits - p_amount,
      updated_at = now()
  WHERE id = v_sender_profile_id;
  
  -- Credit receiver balance and super_dm_earnings
  UPDATE profiles
  SET balance = COALESCE(balance, 0) + v_net_amount,
      super_dm_earnings = COALESCE(super_dm_earnings, 0) + v_net_amount,
      updated_at = now()
  WHERE id = v_receiver_profile_id;
  
  -- Insert the priority message
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
    v_sender_profile_id,
    p_content,
    p_media_url,
    p_media_type,
    true,
    p_amount,
    now()
  )
  RETURNING id INTO v_message_id;
  
  -- Update conversation_participants for receiver
  UPDATE conversation_participants
  SET has_unread_priority = true,
      total_priority_amount = COALESCE(total_priority_amount, 0) + p_amount,
      priority_responded = false,
      updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND profile_id = v_receiver_profile_id;
  
  -- Update conversation updated_at
  UPDATE conversations
  SET updated_at = now()
  WHERE id = p_conversation_id;
  
  -- Record the transaction
  INSERT INTO priority_message_transactions (
    message_id,
    sender_profile_id,
    receiver_profile_id,
    amount,
    platform_fee,
    net_amount,
    status
  ) VALUES (
    v_message_id,
    v_sender_profile_id,
    v_receiver_profile_id,
    p_amount,
    v_platform_fee,
    v_net_amount,
    'completed'
  );
  
  -- Also record in transactions table
  INSERT INTO transactions (user_id, amount, type, status, description)
  VALUES 
    (v_sender_profile_id, -p_amount, 'tip', 'completed', 'Super DM enviado'),
    (v_receiver_profile_id, v_net_amount, 'tip', 'completed', 'Super DM recebido');
  
  -- Create notification for receiver
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_receiver_user_id,
    'super_dm',
    '💎 Super DM Recebido!',
    'Alguém pagou ' || p_amount || ' créditos para falar com você',
    jsonb_build_object(
      'sender_profile_id', v_sender_profile_id,
      'amount', p_amount,
      'conversation_id', p_conversation_id,
      'message_id', v_message_id
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_message_id,
    'amount_paid', p_amount,
    'net_amount', v_net_amount
  );
END;
$$;

-- 6. Trigger to clear priority flags when creator responds
CREATE OR REPLACE FUNCTION public.clear_priority_on_creator_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_priority BOOLEAN;
BEGIN
  -- Check if there are unread priority messages in this conversation for the sender
  SELECT has_unread_priority INTO v_has_priority
  FROM conversation_participants
  WHERE conversation_id = NEW.conversation_id
    AND profile_id = NEW.sender_id;
  
  -- If sender had priority messages, clear them (creator is responding)
  IF v_has_priority THEN
    UPDATE conversation_participants
    SET has_unread_priority = false,
        priority_responded = true,
        updated_at = now()
    WHERE conversation_id = NEW.conversation_id
      AND profile_id = NEW.sender_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_clear_priority_on_reply ON public.messages;
CREATE TRIGGER trigger_clear_priority_on_reply
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.clear_priority_on_creator_reply();

-- 7. Function to get Super DM stats for a creator
CREATE OR REPLACE FUNCTION public.get_super_dm_stats(p_profile_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_received NUMERIC;
  v_total_count INTEGER;
  v_avg_amount NUMERIC;
BEGIN
  SELECT 
    COALESCE(SUM(net_amount), 0),
    COUNT(*),
    COALESCE(AVG(net_amount), 0)
  INTO v_total_received, v_total_count, v_avg_amount
  FROM priority_message_transactions
  WHERE receiver_profile_id = p_profile_id;
  
  RETURN jsonb_build_object(
    'total_received', v_total_received,
    'total_count', v_total_count,
    'average_amount', ROUND(v_avg_amount, 2)
  );
END;
$$;

-- 8. Index for faster priority sorting
CREATE INDEX IF NOT EXISTS idx_conv_participants_priority 
ON public.conversation_participants(conversation_id, has_unread_priority DESC, total_priority_amount DESC);

CREATE INDEX IF NOT EXISTS idx_messages_priority 
ON public.messages(conversation_id, is_priority) WHERE is_priority = true;