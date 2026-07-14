
-- Table to track profile visits with dedup
CREATE TABLE public.profile_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visited_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying who visited a profile
CREATE INDEX idx_profile_visits_visited_id ON public.profile_visits(visited_id, visited_at DESC);
-- Index for dedup check
CREATE INDEX idx_profile_visits_dedup ON public.profile_visits(visitor_id, visited_id, visited_at DESC);

-- Enable RLS
ALTER TABLE public.profile_visits ENABLE ROW LEVEL SECURITY;

-- Users can see visits to their own profile
CREATE POLICY "Users can view visits to their profile"
  ON public.profile_visits FOR SELECT
  USING (auth.uid() = visited_id);

-- Users can insert visits (visitor must be themselves)
CREATE POLICY "Users can record their visits"
  ON public.profile_visits FOR INSERT
  WITH CHECK (auth.uid() = visitor_id AND visitor_id != visited_id);

-- Function to record a visit with 1-hour dedup
CREATE OR REPLACE FUNCTION public.record_profile_visit(p_visitor_id UUID, p_visited_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Don't record self-visits
  IF p_visitor_id = p_visited_id THEN
    RETURN;
  END IF;

  -- Check for existing visit within the last hour
  IF EXISTS (
    SELECT 1 FROM profile_visits
    WHERE visitor_id = p_visitor_id
      AND visited_id = p_visited_id
      AND visited_at > now() - interval '1 hour'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO profile_visits (visitor_id, visited_id)
  VALUES (p_visitor_id, p_visited_id);
END;
$$;
