
-- Tabela para vincular conteúdos (posts) a planos de assinatura
CREATE TABLE IF NOT EXISTS public.plan_content_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL,
  post_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT plan_content_items_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  CONSTRAINT plan_content_items_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE,
  CONSTRAINT plan_content_items_unique UNIQUE (plan_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_content_items_plan_id ON public.plan_content_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_content_items_post_id ON public.plan_content_items(post_id);

ALTER TABLE public.plan_content_items ENABLE ROW LEVEL SECURITY;

-- Criadores podem gerenciar conteúdos dos seus próprios planos
CREATE POLICY "Creator manages plan content"
ON public.plan_content_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.subscription_plans sp
    JOIN public.profiles p ON p.id = sp.profile_id
    WHERE sp.id = plan_content_items.plan_id
    AND p.user_id = auth.uid()
  )
);

-- Qualquer assinante ativo do criador pode ver quais conteúdos fazem parte dos planos
CREATE POLICY "Subscriber views plan content"
ON public.plan_content_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.profile_id = s.creator_id
    JOIN public.profiles p ON p.id = s.subscriber_id
    WHERE sp.id = plan_content_items.plan_id
    AND p.user_id = auth.uid()
    AND s.status = 'active'
    AND s.expires_at > now()
  )
);
