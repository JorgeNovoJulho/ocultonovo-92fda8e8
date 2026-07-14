-- Tabela de curtidas em stories
CREATE TABLE IF NOT EXISTS public.story_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(story_id, user_id)
);

-- Tabela de descurtidas em stories
CREATE TABLE IF NOT EXISTS public.story_dislikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(story_id, user_id)
);

-- Indices para performance
CREATE INDEX idx_story_likes_story ON public.story_likes(story_id);
CREATE INDEX idx_story_likes_user ON public.story_likes(user_id);
CREATE INDEX idx_story_dislikes_story ON public.story_dislikes(story_id);
CREATE INDEX idx_story_dislikes_user ON public.story_dislikes(user_id);

-- Habilitar RLS
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_dislikes ENABLE ROW LEVEL SECURITY;

-- Politicas RLS para story_likes
CREATE POLICY "Users can view story likes" ON public.story_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own likes" ON public.story_likes
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own likes" ON public.story_likes
  FOR DELETE USING (user_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Politicas RLS para story_dislikes
CREATE POLICY "Users can view story dislikes" ON public.story_dislikes
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own dislikes" ON public.story_dislikes
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own dislikes" ON public.story_dislikes
  FOR DELETE USING (user_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));