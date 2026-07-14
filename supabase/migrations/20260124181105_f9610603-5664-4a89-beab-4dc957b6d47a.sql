-- Corrigir view para usar SECURITY INVOKER (padrão seguro)
DROP VIEW IF EXISTS public.engagement_heatmap;

CREATE VIEW public.engagement_heatmap 
WITH (security_invoker = true)
AS
SELECT 
  hour_of_day,
  day_of_week,
  event_type,
  COUNT(*) as event_count
FROM engagement_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY hour_of_day, day_of_week, event_type;
