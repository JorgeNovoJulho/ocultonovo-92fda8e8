-- Create churn_alerts table for tracking abandoned checkouts
CREATE TABLE IF NOT EXISTS public.churn_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkout_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  abandoned_at TIMESTAMP WITH TIME ZONE,
  recovery_sent_at TIMESTAMP WITH TIME ZONE,
  recovered_at TIMESTAMP WITH TIME ZONE,
  product_type TEXT NOT NULL,
  product_id UUID,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'abandoned', 'recovered', 'expired')),
  recovery_channel TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.churn_alerts ENABLE ROW LEVEL SECURITY;

-- Users can view their own churn alerts
CREATE POLICY "Users can view own churn alerts"
  ON public.churn_alerts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own churn alerts
CREATE POLICY "Users can create own churn alerts"
  ON public.churn_alerts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own churn alerts
CREATE POLICY "Users can update own churn alerts"
  ON public.churn_alerts
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own churn alerts
CREATE POLICY "Users can delete own churn alerts"
  ON public.churn_alerts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_churn_alerts_user_status ON public.churn_alerts(user_id, status);
CREATE INDEX idx_churn_alerts_abandoned_at ON public.churn_alerts(abandoned_at) WHERE status = 'abandoned';

-- Create webhook_events table for payment gateway integration
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'ignored')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (only service role can access)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- No public policies - only service role access
-- This is intentional for security

-- Create index for faster queries
CREATE INDEX idx_webhook_events_provider_status ON public.webhook_events(provider, status);
CREATE INDEX idx_webhook_events_event_id ON public.webhook_events(event_id);

-- Create pix_payments table for instant Pix tracking
CREATE TABLE IF NOT EXISTS public.pix_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id TEXT UNIQUE,
  amount DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
  pix_key TEXT,
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  processing_time_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pix_payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own pix payments
CREATE POLICY "Users can view own pix payments"
  ON public.pix_payments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own pix payments
CREATE POLICY "Users can create own pix payments"
  ON public.pix_payments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_pix_payments_user_id ON public.pix_payments(user_id);
CREATE INDEX idx_pix_payments_transaction_id ON public.pix_payments(transaction_id);
CREATE INDEX idx_pix_payments_status ON public.pix_payments(status);

-- Trigger for updated_at
CREATE TRIGGER update_pix_payments_updated_at
  BEFORE UPDATE ON public.pix_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();