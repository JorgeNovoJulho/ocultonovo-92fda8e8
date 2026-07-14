-- Assign admin_master role to ocultomaster@ocultoswing.com.br
-- This will work once the user signs up via /signup
-- The trigger function will insert the role after the profile is created

-- First, create a function that will be called manually or via trigger to assign the admin role
CREATE OR REPLACE FUNCTION public.assign_admin_master_to_ocultomaster()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Get the user_id from auth.users by email
  SELECT id INTO admin_user_id 
  FROM auth.users 
  WHERE email = 'ocultomaster@ocultoswing.com.br';
  
  -- Only proceed if user exists
  IF admin_user_id IS NOT NULL THEN
    -- Insert admin_master role if not exists
    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (admin_user_id, 'admin_master', admin_user_id)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;