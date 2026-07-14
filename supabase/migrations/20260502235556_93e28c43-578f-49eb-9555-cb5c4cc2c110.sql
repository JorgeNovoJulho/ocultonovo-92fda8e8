
-- 1. Função canônica SECURITY DEFINER para checar assinatura ativa
CREATE OR REPLACE FUNCTION public.has_active_subscription(_creator_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.profiles p ON p.id = s.subscriber_id
    WHERE p.user_id = auth.uid()
      AND s.creator_id = _creator_profile_id
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > now())
  );
$$;

-- 2. Índices de performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber_status
  ON public.subscriptions (subscriber_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_creator_status
  ON public.subscriptions (creator_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at
  ON public.subscriptions (expires_at) WHERE status = 'active';

-- 3. Corrigir policies quebradas em posts (subscriber_id = auth.uid era bug — é profiles.id)
DROP POLICY IF EXISTS "Friends posts visible to friends" ON public.posts;
DROP POLICY IF EXISTS "VIP posts visible to VIP subscribers" ON public.posts;

CREATE POLICY "Friends posts visible to friends"
ON public.posts FOR SELECT
USING (
  privacy_level = 'friends'
  AND (
    user_id = auth.uid()
    OR public.has_active_subscription(posts.user_id)
  )
);

CREATE POLICY "VIP posts visible to VIP subscribers"
ON public.posts FOR SELECT
USING (
  privacy_level = 'vip'
  AND (
    user_id = auth.uid()
    OR public.has_active_subscription(posts.user_id)
  )
);

-- 4. Trigger para auto-expirar assinaturas vencidas em leitura/escrita
CREATE OR REPLACE FUNCTION public.expire_subscription_if_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_subscription_if_due ON public.subscriptions;
CREATE TRIGGER trg_expire_subscription_if_due
BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.expire_subscription_if_due();

-- 5. CHECK constraint defensivo no status
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active','expired','cancelled','past_due','pending'));
