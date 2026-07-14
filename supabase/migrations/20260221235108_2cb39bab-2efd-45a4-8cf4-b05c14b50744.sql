-- Add Asaas transfer tracking columns to withdrawal_requests
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS asaas_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_transfer_status TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;

-- Add index for admin queries
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests(status);
