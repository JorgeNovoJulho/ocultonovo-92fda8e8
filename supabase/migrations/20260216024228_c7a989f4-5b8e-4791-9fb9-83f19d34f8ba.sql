
-- Allow message senders to update their own messages (for deletion)
CREATE POLICY "Users can update own messages for deletion"
ON public.messages
FOR UPDATE
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);

-- Allow participants to update deleted_by on messages in their conversations
CREATE POLICY "Participants can mark messages as deleted for self"
ON public.messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = messages.conversation_id
    AND user_id = auth.uid()
  )
);
