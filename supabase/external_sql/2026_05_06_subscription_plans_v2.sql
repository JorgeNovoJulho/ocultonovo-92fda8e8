-- =====================================================================
-- Wizard Planos de Assinatura V2 — schema idempotente (auto-cria base)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- =====================================================================

-- 0) Garante tabela base subscription_plans (caso ainda não exista)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL,
  title           text NOT NULL,
  description     text,
  monthly_price   numeric(10,2) NOT NULL DEFAULT 0,
  annual_price    numeric(10,2),
  banner_url      text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_profile ON public.subscription_plans(profile_id);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='sp_public_read') THEN
    CREATE POLICY sp_public_read ON public.subscription_plans
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='sp_creator_manage') THEN
    CREATE POLICY sp_creator_manage ON public.subscription_plans
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = subscription_plans.profile_id AND p.user_id = auth.uid())
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = subscription_plans.profile_id AND p.user_id = auth.uid())
      );
  END IF;
END $$;

-- 1) Novas colunas em subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS plan_type           text NOT NULL DEFAULT 'mixed_content',
  ADD COLUMN IF NOT EXISTS accepts_pix         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepts_card        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS affiliate_user_id   uuid,
  ADD COLUMN IF NOT EXISTS annual_price        numeric(10,2),
  ADD COLUMN IF NOT EXISTS banner_url          text,
  ADD COLUMN IF NOT EXISTS description         text;

-- Validação via trigger (em vez de CHECK rígido)
CREATE OR REPLACE FUNCTION public.tg_validate_plan_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.plan_type NOT IN ('image_bank','short_video_bank','long_video','mixed_content') THEN
    RAISE EXCEPTION 'plan_type inválido: %', NEW.plan_type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_plan_type ON public.subscription_plans;
CREATE TRIGGER validate_plan_type
  BEFORE INSERT OR UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_plan_type();

-- 2) Tabela base subscriptions (caso ainda não exista) - mínima p/ FK das policies
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id   uuid NOT NULL,
  creator_id      uuid,
  plan_id         uuid,
  status          text NOT NULL DEFAULT 'active',
  price           numeric(10,2) DEFAULT 0,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid;

-- 3) Tabela de mídias do plano
CREATE TABLE IF NOT EXISTS public.subscription_plan_media (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  media_url        text NOT NULL,
  media_type       text NOT NULL,
  duration_seconds int,
  sort_order       int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spm_plan_id ON public.subscription_plan_media(plan_id);

ALTER TABLE public.subscription_plan_media ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='spm_creator_manage') THEN
    CREATE POLICY spm_creator_manage ON public.subscription_plan_media
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.subscription_plans sp
          JOIN public.profiles p ON p.id = sp.profile_id
          WHERE sp.id = subscription_plan_media.plan_id
            AND p.user_id = auth.uid()
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.subscription_plans sp
          JOIN public.profiles p ON p.id = sp.profile_id
          WHERE sp.id = subscription_plan_media.plan_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='spm_subscriber_read') THEN
    CREATE POLICY spm_subscriber_read ON public.subscription_plan_media
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.plan_id = subscription_plan_media.plan_id
            AND s.subscriber_id = auth.uid()
            AND (s.expires_at IS NULL OR s.expires_at > now())
            AND s.status = 'active'
        )
      );
  END IF;
END $$;

-- 4) Bucket para banners e mídias dos planos
INSERT INTO storage.buckets (id, name, public)
VALUES ('plan-media', 'plan-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='plan_media_read') THEN
    CREATE POLICY plan_media_read ON storage.objects
      FOR SELECT USING (bucket_id = 'plan-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='plan_media_creator_write') THEN
    CREATE POLICY plan_media_creator_write ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'plan-media' AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='plan_media_creator_delete') THEN
    CREATE POLICY plan_media_creator_delete ON storage.objects
      FOR DELETE USING (
        bucket_id = 'plan-media' AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
