DROP FUNCTION IF EXISTS public.check_and_increment_usage(text);
DROP FUNCTION IF EXISTS public.peek_usage(text);
DROP TABLE IF EXISTS public.usage_counters;
DROP TABLE IF EXISTS public.usage_limits;
DROP TABLE IF EXISTS public.plan_permissions;