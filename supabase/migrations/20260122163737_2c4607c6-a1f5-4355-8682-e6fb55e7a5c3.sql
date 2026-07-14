-- Fix overly permissive RLS policies

-- Drop the permissive policies
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can insert participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Create more restrictive policies for conversations
-- Users can only create conversations (the trigger/application logic will handle participants)
CREATE POLICY "Authenticated users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can only add participants to conversations they are already part of, or add themselves
CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    (
      -- User is adding themselves
      user_id = auth.uid() OR
      -- User is already a participant in this conversation
      EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.user_id = auth.uid()
      )
    )
  );

-- Only allow notification creation for the authenticated user's own notifications
CREATE POLICY "Users can create their own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (user_id = auth.uid());