-- Allow admins to read all withdrawal requests
CREATE POLICY "Admins can view all withdrawals"
  ON public.withdrawal_requests
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));
