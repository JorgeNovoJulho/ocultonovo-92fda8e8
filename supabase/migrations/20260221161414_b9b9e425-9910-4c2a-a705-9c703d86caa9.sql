
-- =====================================================
-- PROMOTIONS TABLE
-- =====================================================

-- Enum for promotion types
DO $$ BEGIN
  CREATE TYPE public.promotion_type AS ENUM ('referral', 'cashback', 'bonus_plan', 'creator_commission', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Main table
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  description text,
  rules text,
  type promotion_type NOT NULL DEFAULT 'custom',
  reward_value numeric DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  banner_text text,
  start_date timestamptz,
  end_date timestamptz
);

-- Timestamp trigger
CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users
CREATE POLICY "Authenticated users can view active promotions"
  ON public.promotions FOR SELECT TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: admin only via has_role
CREATE POLICY "Admins can insert promotions"
  ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin_master', 'admin'))
  );

CREATE POLICY "Admins can update promotions"
  ON public.promotions FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin_master', 'admin'))
  );

CREATE POLICY "Admins can delete promotions"
  ON public.promotions FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin_master', 'admin'))
  );

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.promotions;
