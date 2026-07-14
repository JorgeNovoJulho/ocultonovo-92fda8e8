
-- NPS Surveys table
CREATE TABLE public.nps_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  question TEXT NOT NULL DEFAULT 'De 0 a 10, qual a probabilidade de você recomendar o Oculto para um amigo?',
  followup_question TEXT DEFAULT 'O que motivou sua nota?',
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'scheduled', 'event_based', 'time_based')),
  trigger_event TEXT, -- e.g., 'after_purchase', 'after_30_days', 'after_subscription'
  trigger_days_after_signup INTEGER,
  target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'subscribers', 'creators', 'new_users', 'active_users')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  show_frequency_days INTEGER DEFAULT 90, -- Don't show to same user within X days
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  responses_count INTEGER NOT NULL DEFAULT 0,
  avg_score DECIMAL(4,2),
  nps_score INTEGER, -- Calculated NPS (-100 to 100)
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NPS Responses table
CREATE TABLE public.nps_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID NOT NULL REFERENCES public.nps_surveys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment TEXT,
  category TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN score >= 9 THEN 'promoter'
      WHEN score >= 7 THEN 'passive'
      ELSE 'detractor'
    END
  ) STORED,
  user_agent TEXT,
  page_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feedback Forms table
CREATE TABLE public.feedback_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  form_type TEXT NOT NULL DEFAULT 'general' CHECK (form_type IN ('general', 'bug_report', 'feature_request', 'support', 'cancellation', 'onboarding')),
  fields JSONB NOT NULL DEFAULT '[]', -- Array of form field definitions
  thank_you_message TEXT DEFAULT 'Obrigado pelo seu feedback!',
  is_active BOOLEAN NOT NULL DEFAULT true,
  responses_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feedback Responses table
CREATE TABLE public.feedback_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.feedback_forms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responses JSONB NOT NULL DEFAULT '{}',
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'actioned', 'archived')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feature Requests table (with voting)
CREATE TABLE public.feature_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'ui', 'feature', 'integration', 'performance', 'mobile')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'planned', 'in_progress', 'completed', 'declined')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  votes_count INTEGER NOT NULL DEFAULT 0,
  admin_response TEXT,
  responded_by UUID REFERENCES auth.users(id),
  responded_at TIMESTAMPTZ,
  estimated_release TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feature Request Votes table
CREATE TABLE public.feature_request_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id, user_id)
);

-- Indexes
CREATE INDEX idx_nps_surveys_active ON public.nps_surveys(is_active) WHERE is_active = true;
CREATE INDEX idx_nps_responses_survey ON public.nps_responses(survey_id);
CREATE INDEX idx_nps_responses_user ON public.nps_responses(user_id);
CREATE INDEX idx_nps_responses_category ON public.nps_responses(category);
CREATE INDEX idx_feedback_forms_active ON public.feedback_forms(is_active) WHERE is_active = true;
CREATE INDEX idx_feedback_responses_form ON public.feedback_responses(form_id);
CREATE INDEX idx_feedback_responses_status ON public.feedback_responses(status);
CREATE INDEX idx_feature_requests_status ON public.feature_requests(status);
CREATE INDEX idx_feature_requests_votes ON public.feature_requests(votes_count DESC);
CREATE INDEX idx_feature_request_votes_request ON public.feature_request_votes(request_id);

-- Enable RLS
ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_request_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for nps_surveys
CREATE POLICY "Admins can manage NPS surveys"
ON public.nps_surveys FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin_master', 'admin_marketing')));

CREATE POLICY "Users can view active surveys"
ON public.nps_surveys FOR SELECT
USING (is_active = true);

-- RLS Policies for nps_responses
CREATE POLICY "Admins can view all NPS responses"
ON public.nps_responses FOR SELECT
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin_master', 'admin_marketing')));

CREATE POLICY "Users can insert their own responses"
ON public.nps_responses FOR INSERT
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can view their own responses"
ON public.nps_responses FOR SELECT
USING (user_id = auth.uid());

-- RLS Policies for feedback_forms
CREATE POLICY "Admins can manage feedback forms"
ON public.feedback_forms FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin_master', 'admin_support')));

CREATE POLICY "Users can view active forms"
ON public.feedback_forms FOR SELECT
USING (is_active = true);

-- RLS Policies for feedback_responses
CREATE POLICY "Admins can manage feedback responses"
ON public.feedback_responses FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin_master', 'admin_support')));

CREATE POLICY "Users can insert their own feedback"
ON public.feedback_responses FOR INSERT
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can view their own feedback"
ON public.feedback_responses FOR SELECT
USING (user_id = auth.uid());

-- RLS Policies for feature_requests
CREATE POLICY "Admins can manage feature requests"
ON public.feature_requests FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin_master', 'admin_support')));

CREATE POLICY "Users can view public requests"
ON public.feature_requests FOR SELECT
USING (is_public = true OR user_id = auth.uid());

CREATE POLICY "Users can create requests"
ON public.feature_requests FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own requests"
ON public.feature_requests FOR UPDATE
USING (user_id = auth.uid());

-- RLS Policies for feature_request_votes
CREATE POLICY "Anyone can view votes"
ON public.feature_request_votes FOR SELECT
USING (true);

CREATE POLICY "Users can vote"
ON public.feature_request_votes FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove their votes"
ON public.feature_request_votes FOR DELETE
USING (user_id = auth.uid());

-- Function to calculate NPS score
CREATE OR REPLACE FUNCTION public.calculate_nps(p_survey_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_promoters INTEGER;
  v_detractors INTEGER;
  v_total INTEGER;
  v_nps INTEGER;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE category = 'promoter'),
    COUNT(*) FILTER (WHERE category = 'detractor'),
    COUNT(*)
  INTO v_promoters, v_detractors, v_total
  FROM nps_responses
  WHERE survey_id = p_survey_id;
  
  IF v_total = 0 THEN
    RETURN NULL;
  END IF;
  
  v_nps := ROUND(((v_promoters::DECIMAL / v_total) - (v_detractors::DECIMAL / v_total)) * 100);
  
  -- Update survey with calculated NPS
  UPDATE nps_surveys
  SET nps_score = v_nps,
      avg_score = (SELECT AVG(score) FROM nps_responses WHERE survey_id = p_survey_id),
      responses_count = v_total,
      updated_at = now()
  WHERE id = p_survey_id;
  
  RETURN v_nps;
END;
$$;

-- Function to check if user should see NPS survey
CREATE OR REPLACE FUNCTION public.should_show_nps(p_user_id UUID, p_survey_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_survey RECORD;
  v_last_response TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_survey
  FROM nps_surveys
  WHERE id = p_survey_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check date range
  IF v_survey.start_date IS NOT NULL AND now() < v_survey.start_date THEN
    RETURN false;
  END IF;
  
  IF v_survey.end_date IS NOT NULL AND now() > v_survey.end_date THEN
    RETURN false;
  END IF;
  
  -- Check last response from this user
  SELECT MAX(created_at) INTO v_last_response
  FROM nps_responses
  WHERE user_id = p_user_id AND survey_id = p_survey_id;
  
  IF v_last_response IS NOT NULL AND 
     v_last_response > now() - (v_survey.show_frequency_days || ' days')::interval THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Trigger to update votes count
CREATE OR REPLACE FUNCTION public.update_feature_votes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE feature_requests
    SET votes_count = votes_count + 1, updated_at = now()
    WHERE id = NEW.request_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE feature_requests
    SET votes_count = votes_count - 1, updated_at = now()
    WHERE id = OLD.request_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_update_feature_votes
AFTER INSERT OR DELETE ON public.feature_request_votes
FOR EACH ROW
EXECUTE FUNCTION public.update_feature_votes_count();

-- Insert default NPS survey
INSERT INTO public.nps_surveys (name, description, trigger_type, is_active)
VALUES ('NPS Geral', 'Pesquisa padrão de satisfação do usuário', 'manual', true);

-- Insert default feedback form
INSERT INTO public.feedback_forms (name, description, form_type, fields, is_active)
VALUES (
  'Feedback Geral',
  'Formulário para feedback geral dos usuários',
  'general',
  '[
    {"name": "satisfaction", "type": "rating", "label": "Qual sua satisfação geral?", "required": true},
    {"name": "best_feature", "type": "text", "label": "O que você mais gosta?", "required": false},
    {"name": "improvement", "type": "textarea", "label": "O que podemos melhorar?", "required": false},
    {"name": "recommend", "type": "select", "label": "Você recomendaria?", "options": ["Sim", "Talvez", "Não"], "required": true}
  ]'::jsonb,
  true
);
