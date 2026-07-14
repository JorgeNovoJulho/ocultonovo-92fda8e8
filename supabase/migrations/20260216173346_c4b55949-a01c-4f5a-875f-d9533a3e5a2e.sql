
-- Fix notifications RLS to allow creating notifications for other users
DROP POLICY IF EXISTS "Users can create their own notifications" ON public.notifications;
CREATE POLICY "Authenticated users can create notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);
