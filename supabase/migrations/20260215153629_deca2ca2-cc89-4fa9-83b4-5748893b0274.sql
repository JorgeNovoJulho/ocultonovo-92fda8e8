
-- Drop problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Users can view their participations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can insert into conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can update their participations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can update their participation" ON conversation_participants;
DROP POLICY IF EXISTS "Users can delete their participation" ON conversation_participants;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversation_participants;

-- Recreate clean policies without self-referencing subqueries
CREATE POLICY "cp_select_own" ON conversation_participants
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "cp_insert_own" ON conversation_participants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "cp_update_own" ON conversation_participants
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "cp_delete_own" ON conversation_participants
  FOR DELETE USING (user_id = auth.uid());
