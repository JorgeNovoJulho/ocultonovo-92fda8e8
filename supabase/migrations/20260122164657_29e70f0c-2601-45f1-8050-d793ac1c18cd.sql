-- Update profiles table with new columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username text UNIQUE,
ADD COLUMN IF NOT EXISTS is_creator boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS location_lat double precision,
ADD COLUMN IF NOT EXISTS location_lng double precision,
ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'free' CHECK (plan_type IN ('free', 'vip')),
ADD COLUMN IF NOT EXISTS bio text;

-- Create posts table
CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_text text,
  media_url text,
  privacy_level text DEFAULT 'public' CHECK (privacy_level IN ('public', 'friends', 'vip')),
  is_locked boolean DEFAULT false,
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  price numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  UNIQUE(subscriber_id, creator_id)
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'subscription', 'tip', 'payout')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  description text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create post_likes table for tracking likes
CREATE TABLE IF NOT EXISTS public.post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Create saved_posts table
CREATE TABLE IF NOT EXISTS public.saved_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Enable RLS on all new tables
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

-- Posts policies
CREATE POLICY "Public posts are viewable by everyone" ON public.posts
FOR SELECT USING (privacy_level = 'public');

CREATE POLICY "Friends posts visible to friends" ON public.posts
FOR SELECT USING (
  privacy_level = 'friends' AND (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.subscriptions 
      WHERE subscriber_id = auth.uid() AND creator_id = posts.user_id AND status = 'active'
    )
  )
);

CREATE POLICY "VIP posts visible to VIP subscribers" ON public.posts
FOR SELECT USING (
  privacy_level = 'vip' AND (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.subscriptions 
      WHERE subscriber_id = auth.uid() AND creator_id = posts.user_id AND status = 'active'
    )
  )
);

CREATE POLICY "Users can create their own posts" ON public.posts
FOR INSERT WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own posts" ON public.posts
FOR UPDATE USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own posts" ON public.posts
FOR DELETE USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Subscriptions policies
CREATE POLICY "Users can view their subscriptions" ON public.subscriptions
FOR SELECT USING (
  subscriber_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR
  creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can create subscriptions" ON public.subscriptions
FOR INSERT WITH CHECK (subscriber_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their subscriptions" ON public.subscriptions
FOR UPDATE USING (subscriber_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Transactions policies
CREATE POLICY "Users can view their own transactions" ON public.transactions
FOR SELECT USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create their own transactions" ON public.transactions
FOR INSERT WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Post likes policies
CREATE POLICY "Anyone can view likes" ON public.post_likes
FOR SELECT USING (true);

CREATE POLICY "Users can like posts" ON public.post_likes
FOR INSERT WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can unlike posts" ON public.post_likes
FOR DELETE USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Saved posts policies
CREATE POLICY "Users can view their saved posts" ON public.saved_posts
FOR SELECT USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can save posts" ON public.saved_posts
FOR INSERT WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can unsave posts" ON public.saved_posts
FOR DELETE USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Enable realtime for posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;