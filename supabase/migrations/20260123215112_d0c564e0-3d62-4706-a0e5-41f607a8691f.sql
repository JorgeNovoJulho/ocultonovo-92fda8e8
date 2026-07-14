-- =====================================================
-- AUCTION SYSTEM TABLES
-- =====================================================

-- Table: auctions (main auction data)
CREATE TABLE IF NOT EXISTS public.auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image' CHECK (media_type IN ('image', 'video', 'call_promise')),
  starting_price NUMERIC NOT NULL DEFAULT 10 CHECK (starting_price >= 1),
  min_increment NUMERIC NOT NULL DEFAULT 5 CHECK (min_increment >= 1),
  current_bid NUMERIC DEFAULT 0,
  current_bidder_id UUID REFERENCES public.profiles(id),
  starts_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  original_end_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled', 'failed')),
  winner_id UUID REFERENCES public.profiles(id),
  winner_charged BOOLEAN DEFAULT false,
  content_delivered BOOLEAN DEFAULT false,
  total_bids INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: auction_bids (bid history)
CREATE TABLE IF NOT EXISTS public.auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  is_winning BOOLEAN DEFAULT false,
  outbid_at TIMESTAMPTZ,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: bidder_cards (card verification for bidding)
CREATE TABLE IF NOT EXISTS public.bidder_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL,
  card_last_four TEXT,
  card_brand TEXT,
  is_valid BOOLEAN DEFAULT true,
  verified_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_auctions_creator ON public.auctions(creator_id);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON public.auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_ends_at ON public.auctions(ends_at);
CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON public.auction_bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_bidder ON public.auction_bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bidder_cards_user ON public.bidder_cards(user_id);

-- Enable RLS
ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bidder_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for auctions
CREATE POLICY "Anyone can view active auctions"
  ON public.auctions FOR SELECT
  USING (status = 'active' OR creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creators can create auctions"
  ON public.auctions FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creators can update own auctions"
  ON public.auctions FOR UPDATE
  USING (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- RLS Policies for auction_bids
CREATE POLICY "Anyone can view bids on active auctions"
  ON public.auction_bids FOR SELECT
  USING (true);

CREATE POLICY "Users can place bids"
  ON public.auction_bids FOR INSERT
  WITH CHECK (bidder_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- RLS Policies for bidder_cards
CREATE POLICY "Users can view own cards"
  ON public.bidder_cards FOR SELECT
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own cards"
  ON public.bidder_cards FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own cards"
  ON public.bidder_cards FOR UPDATE
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.auctions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_bids;

-- Function to update auction timestamp
CREATE OR REPLACE FUNCTION public.update_auction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_auctions_timestamp
  BEFORE UPDATE ON public.auctions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_auction_timestamp();

-- Function to handle bid placement with anti-sniping
CREATE OR REPLACE FUNCTION public.place_auction_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_has_valid_card BOOLEAN;
  v_time_remaining INTERVAL;
  v_new_ends_at TIMESTAMPTZ;
  v_previous_bidder_id UUID;
  v_bid_id UUID;
BEGIN
  -- Get auction details
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilao nao encontrado');
  END IF;
  
  IF v_auction.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilao nao esta ativo');
  END IF;
  
  IF v_auction.ends_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilao ja encerrou');
  END IF;
  
  IF v_auction.creator_id = p_bidder_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voce nao pode dar lance no proprio leilao');
  END IF;
  
  -- Check if bidder has valid card
  SELECT EXISTS(
    SELECT 1 FROM bidder_cards 
    WHERE user_id = p_bidder_id AND is_valid = true
  ) INTO v_has_valid_card;
  
  IF NOT v_has_valid_card THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cadastre um cartao valido antes de dar lances', 'requires_card', true);
  END IF;
  
  -- Validate bid amount
  IF v_auction.current_bid = 0 THEN
    -- First bid must be >= starting price
    IF p_amount < v_auction.starting_price THEN
      RETURN jsonb_build_object('success', false, 'error', 'Lance deve ser pelo menos R$ ' || v_auction.starting_price);
    END IF;
  ELSE
    -- Subsequent bids must be >= current + increment
    IF p_amount < v_auction.current_bid + v_auction.min_increment THEN
      RETURN jsonb_build_object('success', false, 'error', 'Lance minimo: R$ ' || (v_auction.current_bid + v_auction.min_increment));
    END IF;
  END IF;
  
  -- Store previous bidder for notification
  v_previous_bidder_id := v_auction.current_bidder_id;
  
  -- Mark previous winning bid as outbid
  IF v_previous_bidder_id IS NOT NULL THEN
    UPDATE auction_bids 
    SET is_winning = false, outbid_at = now()
    WHERE auction_id = p_auction_id AND is_winning = true;
  END IF;
  
  -- Insert new bid
  INSERT INTO auction_bids (auction_id, bidder_id, amount, is_winning)
  VALUES (p_auction_id, p_bidder_id, p_amount, true)
  RETURNING id INTO v_bid_id;
  
  -- Calculate time remaining for anti-sniping
  v_time_remaining := v_auction.ends_at - now();
  v_new_ends_at := v_auction.ends_at;
  
  -- If less than 60 seconds remaining, extend by 2 minutes
  IF v_time_remaining < INTERVAL '60 seconds' THEN
    v_new_ends_at := v_auction.ends_at + INTERVAL '2 minutes';
  END IF;
  
  -- Update auction with new bid
  UPDATE auctions
  SET 
    current_bid = p_amount,
    current_bidder_id = p_bidder_id,
    ends_at = v_new_ends_at,
    total_bids = total_bids + 1,
    updated_at = now()
  WHERE id = p_auction_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'amount', p_amount,
    'new_ends_at', v_new_ends_at,
    'time_extended', v_new_ends_at != v_auction.ends_at,
    'previous_bidder_id', v_previous_bidder_id
  );
END;
$$;

-- Function to end auction and process winner
CREATE OR REPLACE FUNCTION public.end_auction(p_auction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_winner RECORD;
  v_creator RECORD;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilao nao encontrado');
  END IF;
  
  IF v_auction.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilao ja foi encerrado');
  END IF;
  
  -- Get winner details
  IF v_auction.current_bidder_id IS NOT NULL THEN
    SELECT * INTO v_winner FROM profiles WHERE id = v_auction.current_bidder_id;
    
    -- Update auction with winner
    UPDATE auctions
    SET 
      status = 'ended',
      winner_id = v_auction.current_bidder_id,
      updated_at = now()
    WHERE id = p_auction_id;
    
    -- Get creator for notification
    SELECT * INTO v_creator FROM profiles WHERE id = v_auction.creator_id;
    
    -- Create notification for winner
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_winner.user_id,
      'auction',
      '🎉 Voce venceu o leilao!',
      'Parabens! Seu lance de R$ ' || v_auction.current_bid || ' foi o vencedor.',
      jsonb_build_object('auction_id', p_auction_id, 'amount', v_auction.current_bid)
    );
    
    -- Create notification for creator
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_creator.user_id,
      'auction',
      '💰 Seu leilao foi arrematado!',
      'Leilao "' || v_auction.title || '" vendido por R$ ' || v_auction.current_bid,
      jsonb_build_object('auction_id', p_auction_id, 'amount', v_auction.current_bid, 'winner_id', v_winner.id)
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'winner_id', v_auction.current_bidder_id,
      'winning_amount', v_auction.current_bid,
      'needs_charge', true
    );
  ELSE
    -- No bids, mark as ended
    UPDATE auctions
    SET status = 'ended', updated_at = now()
    WHERE id = p_auction_id;
    
    RETURN jsonb_build_object('success', true, 'winner_id', null, 'message', 'Leilao encerrado sem lances');
  END IF;
END;
$$;