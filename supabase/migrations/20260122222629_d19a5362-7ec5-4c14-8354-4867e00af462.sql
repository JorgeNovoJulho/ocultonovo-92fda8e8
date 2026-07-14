-- Create table for looking now matches history
CREATE TABLE public.looking_now_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  distance_km NUMERIC NOT NULL,
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  user1_chat_started BOOLEAN DEFAULT false,
  user2_chat_started BOOLEAN DEFAULT false,
  is_expired BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user1_id, user2_id)
);

-- Enable Row Level Security
ALTER TABLE public.looking_now_matches ENABLE ROW LEVEL SECURITY;

-- Users can view matches they are part of
CREATE POLICY "Users can view their matches" ON public.looking_now_matches
  FOR SELECT USING (
    user1_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR user2_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Users can update their side of the match
CREATE POLICY "Users can update their matches" ON public.looking_now_matches
  FOR UPDATE USING (
    user1_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR user2_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Allow service role to insert (edge function will use service role)
CREATE POLICY "Service can insert matches" ON public.looking_now_matches
  FOR INSERT WITH CHECK (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.looking_now_matches;

-- Create trigger for updated_at
CREATE TRIGGER update_looking_now_matches_updated_at
  BEFORE UPDATE ON public.looking_now_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_timestamp();