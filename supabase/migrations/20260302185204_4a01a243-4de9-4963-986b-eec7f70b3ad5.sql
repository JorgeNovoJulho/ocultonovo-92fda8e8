
-- Fix: Restrict transaction_split_logs to service_role only
DROP POLICY IF EXISTS "Service role full access on split logs" ON public.transaction_split_logs;

CREATE POLICY "Only service role can manage split logs"
  ON public.transaction_split_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins can read split logs
CREATE POLICY "Admins can read split logs"
  ON public.transaction_split_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_staff
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
