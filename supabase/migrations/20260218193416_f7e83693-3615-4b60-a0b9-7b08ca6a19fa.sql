-- Fix: Admin master UPDATE policy needs WITH CHECK clause too
DROP POLICY IF EXISTS "Admin master can update all subscriptions" ON public.subscriptions;

CREATE POLICY "Admin master can update all subscriptions"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin_master'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin_master'
  )
);