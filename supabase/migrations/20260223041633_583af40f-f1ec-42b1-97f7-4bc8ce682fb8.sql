
-- =====================================================
-- PINGS TABLE — Radar interactive pings
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'seen')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  seen_at timestamp with time zone
);

-- Index for fast lookup of recent pings received
CREATE INDEX IF NOT EXISTS idx_pings_receiver_recent ON public.pings (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pings_sender_recent ON public.pings (sender_id, created_at DESC);

-- Anti-spam: one ping per sender→receiver pair (app enforces cooldown)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pings_unique_pair ON public.pings (sender_id, receiver_id) WHERE status = 'sent';

-- Enable RLS
ALTER TABLE public.pings ENABLE ROW LEVEL SECURITY;

-- Users can see pings they sent or received
CREATE POLICY "Users can read own pings"
  ON public.pings FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can send pings (insert)
CREATE POLICY "Users can send pings"
  ON public.pings FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND sender_id != receiver_id);

-- Users can mark pings as seen (update status only)
CREATE POLICY "Users can mark pings as seen"
  ON public.pings FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Users can delete their own sent pings (to allow re-ping)
CREATE POLICY "Users can delete own sent pings"
  ON public.pings FOR DELETE
  USING (auth.uid() = sender_id);

-- Enable realtime for pings
ALTER PUBLICATION supabase_realtime ADD TABLE public.pings;
