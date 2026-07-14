-- Add payment tracking columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'active' CHECK (payment_status IN ('active', 'overdue', 'suspended')),
ADD COLUMN IF NOT EXISTS payment_due_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_payment_reminder_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS payment_reminder_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS subscription_amount numeric DEFAULT 0;

-- Create table for payment reminder history
CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_day integer NOT NULL CHECK (reminder_day IN (1, 3, 7)),
  sent_via text NOT NULL CHECK (sent_via IN ('push', 'email', 'both')),
  sent_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- Only admins can view payment reminders (using is_admin function)
CREATE POLICY "Admins can view all payment reminders"
ON public.payment_reminders
FOR SELECT
USING (is_admin(auth.uid()));

-- Service role can insert reminders (via edge functions)
CREATE POLICY "Service role can insert payment reminders"
ON public.payment_reminders
FOR INSERT
WITH CHECK (true);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_payment_reminders_user_id ON public.payment_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_payment_status ON public.profiles(payment_status) WHERE payment_status != 'active';