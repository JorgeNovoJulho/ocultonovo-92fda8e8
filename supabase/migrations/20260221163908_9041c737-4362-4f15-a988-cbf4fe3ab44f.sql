
-- Anonymous promotion event tracking table
CREATE TABLE public.promotion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'close', 'conversion')),
  session_hash text, -- anonymous session identifier
  time_period text CHECK (time_period IN ('morning', 'afternoon', 'evening')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast aggregation
CREATE INDEX idx_promo_events_promo ON public.promotion_events(promotion_id);
CREATE INDEX idx_promo_events_type ON public.promotion_events(event_type);
CREATE INDEX idx_promo_events_created ON public.promotion_events(created_at);
CREATE INDEX idx_promo_events_composite ON public.promotion_events(promotion_id, event_type, created_at);

-- Enable RLS
ALTER TABLE public.promotion_events ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert events (tracking)
CREATE POLICY "Authenticated users can insert events"
  ON public.promotion_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only admins can read analytics
CREATE POLICY "Admins can read promotion events"
  ON public.promotion_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')
    )
  );

-- Aggregation view for admin dashboard (no personal data)
CREATE OR REPLACE VIEW public.promotion_analytics AS
SELECT
  pe.promotion_id,
  p.title AS promotion_title,
  p.type AS promotion_type,
  p.is_active,
  p.reward_value,
  COUNT(*) FILTER (WHERE pe.event_type = 'impression') AS impressions,
  COUNT(*) FILTER (WHERE pe.event_type = 'click') AS clicks,
  COUNT(*) FILTER (WHERE pe.event_type = 'close') AS closes,
  COUNT(*) FILTER (WHERE pe.event_type = 'conversion') AS conversions,
  CASE 
    WHEN COUNT(*) FILTER (WHERE pe.event_type = 'impression') > 0 
    THEN ROUND(
      (COUNT(*) FILTER (WHERE pe.event_type = 'click')::numeric / 
       COUNT(*) FILTER (WHERE pe.event_type = 'impression')::numeric) * 100, 2
    )
    ELSE 0
  END AS ctr,
  CASE 
    WHEN COUNT(*) FILTER (WHERE pe.event_type = 'impression') > 0 
    THEN ROUND(
      (COUNT(*) FILTER (WHERE pe.event_type = 'close')::numeric / 
       COUNT(*) FILTER (WHERE pe.event_type = 'impression')::numeric) * 100, 2
    )
    ELSE 0
  END AS rejection_rate
FROM public.promotion_events pe
JOIN public.promotions p ON p.id = pe.promotion_id
GROUP BY pe.promotion_id, p.title, p.type, p.is_active, p.reward_value;

-- Period breakdown view
CREATE OR REPLACE VIEW public.promotion_period_stats AS
SELECT
  pe.promotion_id,
  pe.time_period,
  pe.event_type,
  COUNT(*) AS event_count,
  pe.created_at::date AS event_date
FROM public.promotion_events pe
GROUP BY pe.promotion_id, pe.time_period, pe.event_type, pe.created_at::date;

-- Enable realtime for live tracking updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.promotion_events;
