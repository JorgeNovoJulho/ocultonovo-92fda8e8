-- Create user_feedback table for suggestions, complaints, and bugs
CREATE TABLE public.user_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('suggestion', 'complaint', 'bug')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'implemented', 'rejected')),
  admin_response TEXT,
  reward_coupon_code TEXT,
  reward_discount INTEGER,
  responded_by UUID,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create admin_notifications table for realtime admin alerts
CREATE TABLE public.admin_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_feedback
CREATE POLICY "Users can view their own feedback"
  ON public.user_feedback FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create feedback"
  ON public.user_feedback FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all feedback"
  ON public.user_feedback FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update feedback"
  ON public.user_feedback FOR UPDATE
  USING (is_admin(auth.uid()));

-- RLS Policies for admin_notifications
CREATE POLICY "Admins can view all admin notifications"
  ON public.admin_notifications FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can create admin notifications"
  ON public.admin_notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update admin notifications"
  ON public.admin_notifications FOR UPDATE
  USING (is_admin(auth.uid()));

-- Enable realtime for admin notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;

-- Add transaction type for media_unlock
-- Update transactions to support new types for breakdown
-- (transactions already supports: deposit, withdrawal, subscription, tip, payout)
-- We need to add 'media_unlock' type tracking