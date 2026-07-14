-- Tabela para registrar eventos de webhook recebidos
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT,
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(provider, event_id)
);

-- Tabela para splits de pagamento (criador/plataforma)
CREATE TABLE IF NOT EXISTS public.payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_external_id TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  platform_fee DECIMAL(10,2) NOT NULL,
  creator_amount DECIMAL(10,2) NOT NULL,
  platform_fee_percent DECIMAL(5,2) NOT NULL,
  creator_id UUID REFERENCES public.profiles(id),
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para faturas geradas
CREATE TABLE IF NOT EXISTS public.generated_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.transactions(id),
  invoice_number TEXT NOT NULL UNIQUE,
  generated_by UUID REFERENCES auth.users(id),
  html_content TEXT,
  pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Adicionar campo stripe_customer_id aos perfis se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN stripe_customer_id TEXT;
  END IF;
END $$;

-- Adicionar campo completed_at nas transações se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'transactions' 
    AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Função para adicionar saldo ao usuário
CREATE OR REPLACE FUNCTION public.add_to_balance(p_user_id UUID, p_amount DECIMAL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET balance = COALESCE(balance, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON public.webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_splits_external ON public.payment_splits(transaction_external_id);
CREATE INDEX IF NOT EXISTS idx_generated_invoices_tx ON public.generated_invoices(transaction_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON public.profiles(stripe_customer_id);

-- RLS policies
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_invoices ENABLE ROW LEVEL SECURITY;

-- Admins podem ver todos os eventos de webhook
CREATE POLICY "Admins can view webhook events" ON public.webhook_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'admin_master')
    )
  );

-- Admins podem ver todos os splits
CREATE POLICY "Admins can view payment splits" ON public.payment_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'admin_master')
    )
  );

-- Criadores podem ver seus próprios splits
CREATE POLICY "Creators can view own splits" ON public.payment_splits
  FOR SELECT USING (
    creator_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Usuários podem ver suas próprias faturas
CREATE POLICY "Users can view own invoices" ON public.generated_invoices
  FOR SELECT USING (
    generated_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.transactions t
      JOIN public.profiles p ON t.user_id = p.id
      WHERE t.id = transaction_id AND p.user_id = auth.uid()
    )
  );

-- Admins podem ver todas as faturas
CREATE POLICY "Admins can view all invoices" ON public.generated_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'admin_master')
    )
  );
