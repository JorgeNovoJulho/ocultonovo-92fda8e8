-- Add columns to messages table for Pay-Per-View media
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS media_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS unlock_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS unlocked_by UUID[] DEFAULT '{}';

-- Create index for faster lookups on locked media
CREATE INDEX IF NOT EXISTS idx_messages_locked ON public.messages(is_locked) WHERE is_locked = true;

-- Create table to track media unlocks
CREATE TABLE IF NOT EXISTS public.media_unlocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  creator_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable RLS on media_unlocks
ALTER TABLE public.media_unlocks ENABLE ROW LEVEL SECURITY;

-- Policies for media_unlocks
CREATE POLICY "Users can view their own unlocks"
ON public.media_unlocks
FOR SELECT
USING (user_id = auth.uid() OR creator_id = auth.uid());

CREATE POLICY "Users can create unlocks"
ON public.media_unlocks
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Enable realtime for media_unlocks
ALTER PUBLICATION supabase_realtime ADD TABLE public.media_unlocks;