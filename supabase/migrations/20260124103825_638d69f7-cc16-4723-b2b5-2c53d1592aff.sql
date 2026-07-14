-- =====================================================
-- PAID POLLS SYSTEM
-- =====================================================

-- Add post_type column to posts if not exists
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'standard';

-- =====================================================
-- 1. POLLS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  entry_cost NUMERIC DEFAULT 0 CHECK (entry_cost >= 0),
  allow_multiple_votes BOOLEAN DEFAULT false,
  show_results_before_vote BOOLEAN DEFAULT false,
  closes_at TIMESTAMPTZ,
  total_votes INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 2. POLL OPTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  option_order INTEGER DEFAULT 0,
  votes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 3. POLL VOTES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_paid NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster vote lookups
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_voter ON public.poll_votes(poll_id, voter_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.poll_options(poll_id);
CREATE INDEX IF NOT EXISTS idx_polls_creator ON public.polls(creator_id);
CREATE INDEX IF NOT EXISTS idx_polls_post ON public.polls(post_id);

-- =====================================================
-- 4. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- Polls: Anyone can read, creators can insert/update their own
CREATE POLICY "Anyone can read polls" ON public.polls
  FOR SELECT USING (true);

CREATE POLICY "Creators can insert polls" ON public.polls
  FOR INSERT WITH CHECK (
    creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Creators can update their polls" ON public.polls
  FOR UPDATE USING (
    creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Poll Options: Anyone can read, creators can manage
CREATE POLICY "Anyone can read poll options" ON public.poll_options
  FOR SELECT USING (true);

CREATE POLICY "Creators can insert poll options" ON public.poll_options
  FOR INSERT WITH CHECK (
    poll_id IN (
      SELECT id FROM public.polls 
      WHERE creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Creators can update poll options" ON public.poll_options
  FOR UPDATE USING (
    poll_id IN (
      SELECT id FROM public.polls 
      WHERE creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Poll Votes: Anyone can read, authenticated users can insert via RPC
CREATE POLICY "Anyone can read poll votes" ON public.poll_votes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert votes" ON public.poll_votes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- 5. VOTE ON POLL RPC FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION public.vote_on_poll(
  p_poll_id UUID,
  p_option_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll RECORD;
  v_voter RECORD;
  v_voter_credits RECORD;
  v_vote_id UUID;
  v_net_amount NUMERIC;
  v_option_exists BOOLEAN;
BEGIN
  -- Verify option belongs to poll
  SELECT EXISTS(
    SELECT 1 FROM poll_options WHERE id = p_option_id AND poll_id = p_poll_id
  ) INTO v_option_exists;
  
  IF NOT v_option_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opção inválida');
  END IF;

  -- Get poll details
  SELECT * INTO v_poll FROM polls WHERE id = p_poll_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enquete não encontrada');
  END IF;
  
  -- Check if poll is closed
  IF v_poll.closes_at IS NOT NULL AND v_poll.closes_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enquete encerrada');
  END IF;
  
  -- Get voter profile
  SELECT * INTO v_voter FROM profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil não encontrado');
  END IF;
  
  -- Check for duplicate vote if not allowed
  IF NOT v_poll.allow_multiple_votes THEN
    IF EXISTS (SELECT 1 FROM poll_votes WHERE poll_id = p_poll_id AND voter_id = v_voter.id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Você já votou nesta enquete');
    END IF;
  END IF;
  
  -- Handle paid polls
  IF v_poll.entry_cost > 0 THEN
    -- Get voter credits
    SELECT * INTO v_voter_credits FROM user_credits WHERE user_id = v_voter.id;
    
    -- Check balance
    IF NOT FOUND OR COALESCE(v_voter_credits.credits_balance, 0) < v_poll.entry_cost THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Créditos insuficientes',
        'required', v_poll.entry_cost,
        'available', COALESCE(v_voter_credits.credits_balance, 0),
        'code', 'INSUFFICIENT_CREDITS'
      );
    END IF;
    
    -- Check if credits are frozen
    IF v_voter_credits.credits_frozen THEN
      RETURN jsonb_build_object('success', false, 'error', 'Seus créditos estão congelados');
    END IF;
    
    -- Debit voter credits
    UPDATE user_credits 
    SET credits_balance = credits_balance - v_poll.entry_cost, updated_at = now()
    WHERE user_id = v_voter.id;
    
    -- Credit creator (90% - 10% platform fee)
    v_net_amount := v_poll.entry_cost * 0.9;
    
    UPDATE profiles 
    SET balance = COALESCE(balance, 0) + v_net_amount
    WHERE id = v_poll.creator_id;
    
    -- Record transactions
    INSERT INTO transactions (user_id, amount, type, status, description)
    VALUES 
      (v_voter.id, -v_poll.entry_cost, 'tip', 'completed', 'Voto em enquete paga'),
      (v_poll.creator_id, v_net_amount, 'tip', 'completed', 'Voto recebido em enquete');
  END IF;
  
  -- Record vote
  INSERT INTO poll_votes (poll_id, option_id, voter_id, amount_paid)
  VALUES (p_poll_id, p_option_id, v_voter.id, v_poll.entry_cost)
  RETURNING id INTO v_vote_id;
  
  -- Update counters
  UPDATE poll_options SET votes_count = votes_count + 1 WHERE id = p_option_id;
  UPDATE polls SET 
    total_votes = total_votes + 1, 
    total_revenue = total_revenue + v_poll.entry_cost,
    updated_at = now()
  WHERE id = p_poll_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'vote_id', v_vote_id,
    'amount_paid', v_poll.entry_cost,
    'message', 'Voto registrado com sucesso!'
  );
END;
$$;

-- =====================================================
-- 6. ENABLE REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_options;

-- =====================================================
-- 7. UPDATE TIMESTAMP TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_polls_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_polls_updated_at ON public.polls;
CREATE TRIGGER update_polls_updated_at
  BEFORE UPDATE ON public.polls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_polls_updated_at();