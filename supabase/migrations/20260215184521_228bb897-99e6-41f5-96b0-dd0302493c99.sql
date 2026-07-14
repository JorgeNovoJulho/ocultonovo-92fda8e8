
-- Fix: Change view to use SECURITY INVOKER (default, safe)
DROP VIEW IF EXISTS public.founder_vagas_status;
CREATE VIEW public.founder_vagas_status WITH (security_invoker = true) AS
SELECT 
  COUNT(*)::int AS filled,
  (50 - COUNT(*))::int AS remaining,
  50 AS total,
  (COUNT(*) >= 50) AS is_full
FROM public.creator_founders
WHERE is_active = true;
