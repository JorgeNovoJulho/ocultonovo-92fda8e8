
-- Política para admin_master inserir subscrições de teste
CREATE POLICY "Admin master can insert subscriptions"
ON public.subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin_master'
  )
);

-- Política para admin_master visualizar todas as subscrições
CREATE POLICY "Admin master can select all subscriptions"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin_master'
  )
);

-- Política para admin_master atualizar subscrições
CREATE POLICY "Admin master can update all subscriptions"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin_master'
  )
);

-- Política para admin_master inserir transações de teste
CREATE POLICY "Admin master can insert transactions"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin_master'
  )
);

-- Política para admin_master visualizar todas as transações
CREATE POLICY "Admin master can select all transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin_master'
  )
);
