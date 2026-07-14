-- Create public_activities table for realtime activity feed
CREATE TABLE public.public_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('subscription', 'gift', 'ppv_purchase', 'poll_vote', 'auction_bid')),
  actor_name TEXT NOT NULL,
  actor_avatar_url TEXT,
  actor_id UUID REFERENCES public.profiles(id),
  target_creator_name TEXT NOT NULL,
  target_creator_id UUID REFERENCES public.profiles(id),
  amount NUMERIC(10,2),
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast queries
CREATE INDEX idx_public_activities_created_at ON public.public_activities(created_at DESC);
CREATE INDEX idx_public_activities_type ON public.public_activities(activity_type);

-- Enable RLS
ALTER TABLE public.public_activities ENABLE ROW LEVEL SECURITY;

-- Everyone can read public activities (it's a public feed)
CREATE POLICY "Public activities are viewable by everyone"
ON public.public_activities
FOR SELECT
USING (true);

-- Only system/backend can insert (via service role)
CREATE POLICY "Service role can insert activities"
ON public.public_activities
FOR INSERT
WITH CHECK (true);

-- Enable realtime for public activities
ALTER PUBLICATION supabase_realtime ADD TABLE public.public_activities;

-- Function to emit public activity on gift
CREATE OR REPLACE FUNCTION public.emit_gift_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_sender_profile RECORD;
  v_receiver_profile RECORD;
BEGIN
  -- Get sender profile
  SELECT id, name, avatar_url, ghost_mode FROM public.profiles 
  WHERE id = NEW.sender_id INTO v_sender_profile;
  
  -- Get receiver profile
  SELECT id, name, avatar_url FROM public.profiles 
  WHERE id = NEW.receiver_id INTO v_receiver_profile;
  
  -- Insert public activity
  INSERT INTO public.public_activities (
    activity_type,
    actor_name,
    actor_avatar_url,
    actor_id,
    target_creator_name,
    target_creator_id,
    amount,
    is_anonymous,
    metadata
  ) VALUES (
    'gift',
    COALESCE(v_sender_profile.name, 'Usuário'),
    v_sender_profile.avatar_url,
    v_sender_profile.id,
    COALESCE(v_receiver_profile.name, 'Criador'),
    v_receiver_profile.id,
    NEW.amount,
    COALESCE(v_sender_profile.ghost_mode, false),
    jsonb_build_object('gift_id', NEW.id)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on gift_history
CREATE TRIGGER on_gift_sent_emit_activity
  AFTER INSERT ON public.gift_history
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_gift_activity();

-- Function to emit public activity on subscription
CREATE OR REPLACE FUNCTION public.emit_subscription_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_subscriber_profile RECORD;
  v_creator_profile RECORD;
BEGIN
  -- Only emit on new active subscriptions
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  -- Get subscriber profile
  SELECT id, name, avatar_url, ghost_mode FROM public.profiles 
  WHERE id = NEW.subscriber_id INTO v_subscriber_profile;
  
  -- Get creator profile
  SELECT id, name, avatar_url FROM public.profiles 
  WHERE id = NEW.creator_id INTO v_creator_profile;
  
  -- Insert public activity
  INSERT INTO public.public_activities (
    activity_type,
    actor_name,
    actor_avatar_url,
    actor_id,
    target_creator_name,
    target_creator_id,
    amount,
    is_anonymous,
    metadata
  ) VALUES (
    'subscription',
    COALESCE(v_subscriber_profile.name, 'Usuário'),
    v_subscriber_profile.avatar_url,
    v_subscriber_profile.id,
    COALESCE(v_creator_profile.name, 'Criador'),
    v_creator_profile.id,
    NEW.price,
    COALESCE(v_subscriber_profile.ghost_mode, false),
    jsonb_build_object('subscription_id', NEW.id, 'plan_name', NEW.plan_type)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on subscriptions
CREATE TRIGGER on_subscription_created_emit_activity
  AFTER INSERT ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_subscription_activity();

-- Function to emit public activity on poll vote
CREATE OR REPLACE FUNCTION public.emit_poll_vote_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_voter_profile RECORD;
  v_poll RECORD;
  v_creator_profile RECORD;
BEGIN
  -- Get voter profile
  SELECT id, name, avatar_url, ghost_mode FROM public.profiles 
  WHERE id = NEW.voter_id INTO v_voter_profile;
  
  -- Get poll and creator info
  SELECT p.id, p.creator_id, p.entry_cost, pr.name as creator_name, pr.avatar_url as creator_avatar
  FROM public.polls p
  JOIN public.profiles pr ON p.creator_id = pr.id
  WHERE p.id = NEW.poll_id INTO v_poll;
  
  -- Only emit if there's a cost (paid poll)
  IF v_poll.entry_cost IS NULL OR v_poll.entry_cost <= 0 THEN
    RETURN NEW;
  END IF;
  
  -- Insert public activity
  INSERT INTO public.public_activities (
    activity_type,
    actor_name,
    actor_avatar_url,
    actor_id,
    target_creator_name,
    target_creator_id,
    amount,
    is_anonymous,
    metadata
  ) VALUES (
    'poll_vote',
    COALESCE(v_voter_profile.name, 'Usuário'),
    v_voter_profile.avatar_url,
    v_voter_profile.id,
    COALESCE(v_poll.creator_name, 'Criador'),
    v_poll.creator_id,
    v_poll.entry_cost,
    COALESCE(v_voter_profile.ghost_mode, false),
    jsonb_build_object('poll_id', NEW.poll_id)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on poll_votes
CREATE TRIGGER on_poll_vote_emit_activity
  AFTER INSERT ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_poll_vote_activity();