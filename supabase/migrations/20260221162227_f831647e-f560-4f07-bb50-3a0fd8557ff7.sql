
-- Add WhatsApp notification fields to promotions
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS notify_whatsapp boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_audience text DEFAULT 'all' CHECK (whatsapp_audience IN ('all', 'free_only')),
  ADD COLUMN IF NOT EXISTS whatsapp_status text DEFAULT 'idle' CHECK (whatsapp_status IN ('idle', 'sending', 'completed', 'error')),
  ADD COLUMN IF NOT EXISTS whatsapp_sent_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_error_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;

-- Add WhatsApp opt-in to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_promotions_opt_in boolean DEFAULT true;

-- Promotion WhatsApp dispatch logs
CREATE TABLE IF NOT EXISTS public.promotion_whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promotion_whatsapp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage whatsapp logs"
  ON public.promotion_whatsapp_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin_master', 'admin')));

CREATE INDEX idx_promo_wa_logs_promotion ON public.promotion_whatsapp_logs(promotion_id);
