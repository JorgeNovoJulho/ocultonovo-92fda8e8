
-- ═══════════════════════════════════════════════════════════════
-- FIX: Add search_path to functions missing it
-- ═══════════════════════════════════════════════════════════════

-- 1. admin_freeze_user_balance
ALTER FUNCTION public.admin_freeze_user_balance SET search_path = public;

-- 2. convert_balance_to_credits  
ALTER FUNCTION public.convert_balance_to_credits SET search_path = public;

-- 3. get_push_stats
ALTER FUNCTION public.get_push_stats SET search_path = public;

-- 4. send_gift
ALTER FUNCTION public.send_gift SET search_path = public;
