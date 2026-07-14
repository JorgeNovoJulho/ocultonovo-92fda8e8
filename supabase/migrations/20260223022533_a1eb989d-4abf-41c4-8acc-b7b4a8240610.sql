
-- Create table for user saved credit cards
CREATE TABLE public.user_payment_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_holder_name TEXT NOT NULL,
  card_last_four TEXT NOT NULL,
  card_brand TEXT,
  card_expiry_month INTEGER NOT NULL CHECK (card_expiry_month >= 1 AND card_expiry_month <= 12),
  card_expiry_year INTEGER NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_payment_cards ENABLE ROW LEVEL SECURITY;

-- Users can view their own cards
CREATE POLICY "Users can view own cards"
ON public.user_payment_cards FOR SELECT
USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Users can insert their own cards
CREATE POLICY "Users can insert own cards"
ON public.user_payment_cards FOR INSERT
WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Users can update their own cards
CREATE POLICY "Users can update own cards"
ON public.user_payment_cards FOR UPDATE
USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Users can delete their own cards
CREATE POLICY "Users can delete own cards"
ON public.user_payment_cards FOR DELETE
USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_user_payment_cards_updated_at
BEFORE UPDATE ON public.user_payment_cards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
