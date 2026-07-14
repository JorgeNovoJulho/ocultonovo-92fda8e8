-- Trigger function para auto-atribuir admin_master quando o usuário ocultomaster se cadastrar
CREATE OR REPLACE FUNCTION public.auto_assign_admin_master()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se o email for o do admin master, atribuir role automaticamente
  IF NEW.email = 'ocultomaster@ocultoswing.com.br' THEN
    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (NEW.id, 'admin_master', NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Criar trigger que dispara após inserção em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_assign_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_admin
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_admin_master();