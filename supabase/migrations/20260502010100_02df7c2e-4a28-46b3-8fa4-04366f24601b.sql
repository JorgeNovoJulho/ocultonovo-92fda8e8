-- Drop the broken ALL policy that lacked WITH CHECK and only matched admin_staff
DROP POLICY IF EXISTS "Admins can manage settings" ON public.system_settings;

-- Recreate with both USING and WITH CHECK, accepting any admin role variant
CREATE POLICY "Admins can manage settings"
ON public.system_settings
FOR ALL
TO authenticated
USING (
  public.is_admin()
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin_master')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.is_admin()
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin_master')
  OR public.has_role(auth.uid(), 'admin')
);