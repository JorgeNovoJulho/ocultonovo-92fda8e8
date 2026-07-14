
-- Add deletion columns to messages table
ALTER TABLE public.messages 
ADD COLUMN deleted_for_everyone boolean NOT NULL DEFAULT false,
ADD COLUMN deleted_by uuid[] NOT NULL DEFAULT '{}';
