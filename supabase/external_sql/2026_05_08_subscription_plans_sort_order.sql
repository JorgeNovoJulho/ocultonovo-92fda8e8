-- Garante a coluna sort_order em subscription_plans (usada pela vitrine e pelo modal de planos VIP)
-- Idempotente: rode quantas vezes quiser no SQL Editor do Supabase externo.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS subscription_plans_sort_order_idx
  ON public.subscription_plans (profile_id, sort_order);
