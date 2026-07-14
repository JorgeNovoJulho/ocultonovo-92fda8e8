-- Fix the RLS policy to use the correct role names from the app_role enum
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin_master') 
  OR public.has_role(auth.uid(), 'admin_regional') 
  OR public.has_role(auth.uid(), 'moderator')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin_master') 
  OR public.has_role(auth.uid(), 'admin_regional') 
  OR public.has_role(auth.uid(), 'moderator')
);