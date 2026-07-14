-- Tabela de cupons promocionais
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_name text NOT NULL,
  code text NOT NULL,
  discount integer NOT NULL CHECK (discount >= 5 AND discount <= 50),
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  max_uses integer DEFAULT NULL,
  current_uses integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(code)
);

-- Habilitar RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode ver cupons ativos para validação no checkout
CREATE POLICY "Anyone can view active coupons for validation"
  ON public.coupons FOR SELECT
  USING (is_active = true AND end_date > now() AND start_date <= now());

-- Criadores podem ver todos os seus cupons (ativos e inativos)
CREATE POLICY "Creators can view all their coupons"
  ON public.coupons FOR SELECT
  USING (creator_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  ));

-- Criadores podem criar cupons
CREATE POLICY "Creators can create coupons"
  ON public.coupons FOR INSERT
  WITH CHECK (creator_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  ));

-- Criadores podem atualizar seus cupons
CREATE POLICY "Creators can update their coupons"
  ON public.coupons FOR UPDATE
  USING (creator_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  ));

-- Criadores podem deletar seus cupons
CREATE POLICY "Creators can delete their coupons"
  ON public.coupons FOR DELETE
  USING (creator_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  ));

-- Tabela para rastrear indicações com data de início (para regra dos 90 dias)
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id),
  started_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  commission_ended_at timestamp with time zone DEFAULT NULL,
  UNIQUE(referrer_id, referred_user_id)
);

-- Habilitar RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver suas indicações (como referenciador)
CREATE POLICY "Users can view referrals they made"
  ON public.referrals FOR SELECT
  USING (referrer_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  ));

-- Usuários podem ver se foram indicados
CREATE POLICY "Users can view if they were referred"
  ON public.referrals FOR SELECT
  USING (referred_user_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  ));

-- Sistema pode criar referrals (via edge function)
CREATE POLICY "Authenticated users can create referrals"
  ON public.referrals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Habilitar realtime para notificações de cupons
ALTER PUBLICATION supabase_realtime ADD TABLE public.coupons;