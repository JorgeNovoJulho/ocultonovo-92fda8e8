CREATE OR REPLACE FUNCTION public.admin_update_user_plan(
  p_profile_id uuid,
  p_plan_type text,
  p_payment_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se é admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer privilégios de administrador';
  END IF;

  UPDATE profiles
  SET 
    plan_type = p_plan_type,
    payment_status = p_payment_status,
    updated_at = now()
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado: %', p_profile_id;
  END IF;

  RETURN true;
END;
$$;