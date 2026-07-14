-- Fix: messages.is_auto_reply ausente quebra send_welcome_message_to_user
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_auto_reply boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_auto_reply_conv
  ON public.messages (conversation_id, sender_id)
  WHERE is_auto_reply = true;
