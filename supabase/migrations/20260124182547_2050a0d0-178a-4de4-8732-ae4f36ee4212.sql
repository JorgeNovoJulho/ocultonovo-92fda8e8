
-- A/B Experiments table
CREATE TABLE public.ab_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  hypothesis TEXT,
  metric_key TEXT NOT NULL, -- e.g., 'signup_conversion', 'subscription_rate', 'click_rate'
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'archived')),
  traffic_percentage INTEGER NOT NULL DEFAULT 100 CHECK (traffic_percentage BETWEEN 1 AND 100),
  target_sample_size INTEGER,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  winner_variant_id UUID,
  statistical_significance DECIMAL(5,4),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A/B Variants table
CREATE TABLE public.ab_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_control BOOLEAN NOT NULL DEFAULT false,
  config JSONB DEFAULT '{}', -- Configuration for this variant (colors, text, layout, etc.)
  weight INTEGER NOT NULL DEFAULT 50 CHECK (weight BETWEEN 1 AND 100),
  impressions INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  conversion_rate DECIMAL(5,4) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 THEN conversions::DECIMAL / impressions ELSE 0 END
  ) STORED,
  revenue DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User variant assignments
CREATE TABLE public.ab_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.ab_variants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT, -- For anonymous users
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ,
  conversion_value DECIMAL(10,2),
  metadata JSONB DEFAULT '{}',
  UNIQUE(experiment_id, user_id),
  UNIQUE(experiment_id, session_id)
);

-- Conversion events
CREATE TABLE public.ab_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.ab_assignments(id) ON DELETE CASCADE,
  experiment_id UUID NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.ab_variants(id) ON DELETE CASCADE,
  conversion_type TEXT NOT NULL, -- e.g., 'click', 'signup', 'purchase', 'subscription'
  value DECIMAL(10,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ab_experiments_status ON public.ab_experiments(status);
CREATE INDEX idx_ab_variants_experiment ON public.ab_variants(experiment_id);
CREATE INDEX idx_ab_assignments_experiment ON public.ab_assignments(experiment_id);
CREATE INDEX idx_ab_assignments_user ON public.ab_assignments(user_id);
CREATE INDEX idx_ab_assignments_session ON public.ab_assignments(session_id);
CREATE INDEX idx_ab_conversions_experiment ON public.ab_conversions(experiment_id);
CREATE INDEX idx_ab_conversions_variant ON public.ab_conversions(variant_id);

-- Enable RLS
ALTER TABLE public.ab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_conversions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ab_experiments (admin only for management)
CREATE POLICY "Admins can manage experiments"
ON public.ab_experiments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin_master', 'admin_marketing')
  )
);

CREATE POLICY "Anyone can view running experiments"
ON public.ab_experiments
FOR SELECT
USING (status = 'running');

-- RLS Policies for ab_variants
CREATE POLICY "Admins can manage variants"
ON public.ab_variants
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin_master', 'admin_marketing')
  )
);

CREATE POLICY "Anyone can view variants of running experiments"
ON public.ab_variants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ab_experiments
    WHERE id = experiment_id AND status = 'running'
  )
);

-- RLS Policies for ab_assignments
CREATE POLICY "Users can view their own assignments"
ON public.ab_assignments
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "System can manage assignments"
ON public.ab_assignments
FOR ALL
USING (true);

-- RLS Policies for ab_conversions
CREATE POLICY "Admins can view conversions"
ON public.ab_conversions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin_master', 'admin_marketing')
  )
);

CREATE POLICY "System can insert conversions"
ON public.ab_conversions
FOR INSERT
WITH CHECK (true);

-- Function to assign user to experiment variant
CREATE OR REPLACE FUNCTION public.assign_ab_variant(
  p_experiment_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_experiment RECORD;
  v_existing_assignment UUID;
  v_selected_variant_id UUID;
  v_random_num DECIMAL;
  v_cumulative_weight INTEGER := 0;
  v_variant RECORD;
BEGIN
  -- Check if experiment is running
  SELECT * INTO v_experiment
  FROM ab_experiments
  WHERE id = p_experiment_id AND status = 'running';
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Check for existing assignment
  IF p_user_id IS NOT NULL THEN
    SELECT variant_id INTO v_existing_assignment
    FROM ab_assignments
    WHERE experiment_id = p_experiment_id AND user_id = p_user_id;
  ELSIF p_session_id IS NOT NULL THEN
    SELECT variant_id INTO v_existing_assignment
    FROM ab_assignments
    WHERE experiment_id = p_experiment_id AND session_id = p_session_id;
  END IF;
  
  IF v_existing_assignment IS NOT NULL THEN
    RETURN v_existing_assignment;
  END IF;
  
  -- Check traffic percentage
  IF random() * 100 > v_experiment.traffic_percentage THEN
    -- User not included in experiment, assign to control
    SELECT id INTO v_selected_variant_id
    FROM ab_variants
    WHERE experiment_id = p_experiment_id AND is_control = true
    LIMIT 1;
  ELSE
    -- Weighted random selection
    v_random_num := random() * 100;
    
    FOR v_variant IN 
      SELECT id, weight FROM ab_variants 
      WHERE experiment_id = p_experiment_id 
      ORDER BY is_control DESC, created_at
    LOOP
      v_cumulative_weight := v_cumulative_weight + v_variant.weight;
      IF v_random_num <= v_cumulative_weight THEN
        v_selected_variant_id := v_variant.id;
        EXIT;
      END IF;
    END LOOP;
    
    -- Fallback to first variant
    IF v_selected_variant_id IS NULL THEN
      SELECT id INTO v_selected_variant_id
      FROM ab_variants
      WHERE experiment_id = p_experiment_id
      LIMIT 1;
    END IF;
  END IF;
  
  -- Create assignment
  INSERT INTO ab_assignments (experiment_id, variant_id, user_id, session_id)
  VALUES (p_experiment_id, v_selected_variant_id, p_user_id, p_session_id)
  ON CONFLICT DO NOTHING;
  
  -- Increment impressions
  UPDATE ab_variants
  SET impressions = impressions + 1
  WHERE id = v_selected_variant_id;
  
  RETURN v_selected_variant_id;
END;
$$;

-- Function to record conversion
CREATE OR REPLACE FUNCTION public.record_ab_conversion(
  p_experiment_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_conversion_type TEXT DEFAULT 'default',
  p_value DECIMAL DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
BEGIN
  -- Find assignment
  IF p_user_id IS NOT NULL THEN
    SELECT * INTO v_assignment
    FROM ab_assignments
    WHERE experiment_id = p_experiment_id AND user_id = p_user_id;
  ELSIF p_session_id IS NOT NULL THEN
    SELECT * INTO v_assignment
    FROM ab_assignments
    WHERE experiment_id = p_experiment_id AND session_id = p_session_id;
  END IF;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Record conversion
  INSERT INTO ab_conversions (assignment_id, experiment_id, variant_id, conversion_type, value)
  VALUES (v_assignment.id, p_experiment_id, v_assignment.variant_id, p_conversion_type, p_value);
  
  -- Update variant stats
  UPDATE ab_variants
  SET conversions = conversions + 1,
      revenue = revenue + COALESCE(p_value, 0)
  WHERE id = v_assignment.variant_id;
  
  -- Mark assignment as converted
  UPDATE ab_assignments
  SET converted_at = COALESCE(converted_at, now()),
      conversion_value = COALESCE(conversion_value, 0) + COALESCE(p_value, 0)
  WHERE id = v_assignment.id;
  
  RETURN true;
END;
$$;

-- View for experiment results summary
CREATE OR REPLACE VIEW public.ab_experiment_results AS
SELECT 
  e.id as experiment_id,
  e.name as experiment_name,
  e.status,
  e.metric_key,
  v.id as variant_id,
  v.name as variant_name,
  v.is_control,
  v.impressions,
  v.conversions,
  v.conversion_rate,
  v.revenue,
  CASE WHEN v.is_control THEN 0
    ELSE v.conversion_rate - (
      SELECT cv.conversion_rate 
      FROM ab_variants cv 
      WHERE cv.experiment_id = e.id AND cv.is_control = true
      LIMIT 1
    )
  END as lift
FROM ab_experiments e
JOIN ab_variants v ON v.experiment_id = e.id;

-- Grant access to view
ALTER VIEW public.ab_experiment_results SET (security_invoker = true);
