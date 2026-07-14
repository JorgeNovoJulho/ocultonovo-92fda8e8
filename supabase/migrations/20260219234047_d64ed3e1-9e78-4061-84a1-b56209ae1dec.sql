
-- Enable FULL replica identity on messages table so Supabase Realtime
-- sends both OLD and NEW values on UPDATE events.
-- This allows the chat sidebar badge to update immediately when
-- messages are marked as read (is_read: false -> true).
ALTER TABLE public.messages REPLICA IDENTITY FULL;
