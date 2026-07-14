-- Create creator_goals table for storing creator fundraising goals
CREATE TABLE public.creator_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_amount NUMERIC NOT NULL DEFAULT 1000,
  current_amount NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(creator_id, is_active) -- Only one active goal per creator
);

-- Enable RLS
ALTER TABLE public.creator_goals ENABLE ROW LEVEL SECURITY;

-- Creators can manage their own goals
CREATE POLICY "Creators can view their own goals"
ON public.creator_goals
FOR SELECT
USING (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creators can create their own goals"
ON public.creator_goals
FOR INSERT
WITH CHECK (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creators can update their own goals"
ON public.creator_goals
FOR UPDATE
USING (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creators can delete their own goals"
ON public.creator_goals
FOR DELETE
USING (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Everyone can view active goals (for profile display)
CREATE POLICY "Anyone can view active goals"
ON public.creator_goals
FOR SELECT
USING (is_active = true);

-- Create trigger for updated_at
CREATE TRIGGER update_creator_goals_updated_at
BEFORE UPDATE ON public.creator_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_timestamp();

-- Create goal_contributions table for tracking donations
CREATE TABLE public.goal_contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES public.creator_goals(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES public.profiles(id),
  amount NUMERIC NOT NULL,
  message TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

-- Contributors can view their own contributions
CREATE POLICY "Users can view their contributions"
ON public.goal_contributions
FOR SELECT
USING (contributor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Creators can view contributions to their goals
CREATE POLICY "Creators can view contributions to their goals"
ON public.goal_contributions
FOR SELECT
USING (goal_id IN (SELECT id FROM creator_goals WHERE creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())));

-- Anyone can contribute
CREATE POLICY "Authenticated users can contribute"
ON public.goal_contributions
FOR INSERT
WITH CHECK (contributor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));