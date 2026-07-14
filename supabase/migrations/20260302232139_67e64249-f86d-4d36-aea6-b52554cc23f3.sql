-- Create payments_log table for unified payment tracking
CREATE TABLE IF NOT EXISTS public.payments_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid,
  creator_id uuid,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  provider text NOT NULL DEFAULT 'pix', -- 'pix' | 'stripe'
  external_id text, -- Asaas payment ID or Stripe session ID
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'failed' | 'refunded'
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.payments_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own payments
CREATE POLICY "Users can view own payments"
ON public.payments_log FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own payments
CREATE POLICY "Users can create own payments"
ON public.payments_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Service role can update (webhooks)
CREATE POLICY "Service role can update payments"
ON public.payments_log FOR UPDATE
TO authenticated
USING (true);

-- Enable Realtime for instant unlock
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments_log;

-- Auto-update updated_at
CREATE TRIGGER update_payments_log_updated_at
BEFORE UPDATE ON public.payments_log
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
