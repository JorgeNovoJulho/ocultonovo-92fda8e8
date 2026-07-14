CREATE OR REPLACE FUNCTION public.get_online_users_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.profiles
  WHERE is_online = true
    AND last_seen >= (now() - interval '5 minutes');
$$;

CREATE OR REPLACE FUNCTION public.get_signups_today_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.profiles
  WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
$$;

GRANT EXECUTE ON FUNCTION public.get_online_users_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_signups_today_count() TO anon, authenticated;