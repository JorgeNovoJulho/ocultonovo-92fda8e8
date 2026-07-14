
-- Fix SELECT policy: users need to see other participants in their conversations
DROP POLICY IF EXISTS "cp_select_own" ON conversation_participants;

CREATE POLICY "cp_select_own_or_shared" ON conversation_participants
  FOR SELECT USING (
    user_id = auth.uid() 
    OR is_conversation_participant(conversation_id, auth.uid())
  );
