
-- Add missing DELETE RLS policy for notifications table
CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
USING (user_id = auth.uid());
