
-- Perfect Pairs table
CREATE TABLE IF NOT EXISTS public.perfect_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('like', 'dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, target_id)
);

ALTER TABLE public.perfect_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own pairs" ON public.perfect_pairs
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM profiles WHERE id = perfect_pairs.user_id));

CREATE POLICY "Users can read own pairs" ON public.perfect_pairs
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM profiles WHERE id = perfect_pairs.user_id));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.perfect_pairs;

-- Trigger: when both users liked each other, create notifications
CREATE OR REPLACE FUNCTION public.check_perfect_pair_match()
RETURNS TRIGGER AS $$
DECLARE
  v_reverse_exists boolean;
  v_user_name text;
  v_target_name text;
  v_user_auth_id uuid;
  v_target_auth_id uuid;
BEGIN
  IF NEW.action = 'like' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.perfect_pairs
      WHERE user_id = NEW.target_id AND target_id = NEW.user_id AND action = 'like'
    ) INTO v_reverse_exists;

    IF v_reverse_exists THEN
      SELECT name, user_id INTO v_user_name, v_user_auth_id FROM public.profiles WHERE id = NEW.user_id;
      SELECT name, user_id INTO v_target_name, v_target_auth_id FROM public.profiles WHERE id = NEW.target_id;

      -- Notify both users
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES 
        (v_user_auth_id, 'looking_now_match', 'Perfect Pair! 💕', v_target_name || ' também curtiu você!', jsonb_build_object('pair_user_id', NEW.target_id)),
        (v_target_auth_id, 'looking_now_match', 'Perfect Pair! 💕', v_user_name || ' também curtiu você!', jsonb_build_object('pair_user_id', NEW.user_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_perfect_pair_insert
  AFTER INSERT ON public.perfect_pairs
  FOR EACH ROW EXECUTE FUNCTION public.check_perfect_pair_match();
