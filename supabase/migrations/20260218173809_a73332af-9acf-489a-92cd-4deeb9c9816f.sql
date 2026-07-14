CREATE OR REPLACE FUNCTION public.search_users_with_email(p_query text)
 RETURNS TABLE(id uuid, user_id uuid, name text, username text, email text, avatar_url text, plan_type text, payment_status text, payment_due_date timestamp with time zone, is_creator boolean, is_verified boolean, balance numeric, balance_frozen boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name::text,
    p.username::text,
    u.email::text,
    p.avatar_url::text,
    p.plan_type::text,
    p.payment_status::text,
    p.payment_due_date,
    p.is_creator,
    p.is_verified,
    p.balance,
    p.balance_frozen,
    p.updated_at
  FROM profiles p
  LEFT JOIN auth.users u ON p.user_id = u.id
  WHERE 
    (p.is_seed = false OR p.is_seed IS NULL)
    AND (
      u.email ILIKE '%' || p_query || '%'
      OR p.name ILIKE '%' || p_query || '%'
      OR p.username ILIKE '%' || p_query || '%'
    )
  ORDER BY p.name
  LIMIT 50;
END;
$function$;