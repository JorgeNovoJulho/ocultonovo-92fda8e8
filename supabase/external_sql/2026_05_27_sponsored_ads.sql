-- =====================================================================
-- 2026_05_27 — Sistema de Anúncios Patrocinados (Sponsored Ads)
-- Cria do zero: ad_campaigns + ad_interactions + RPC + view + RLS.
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente — pode rodar várias vezes.
-- =====================================================================

-- ---------- 1. TABELA PRINCIPAL: ad_campaigns ------------------------
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id      uuid,
  title              text NOT NULL,
  description        text,
  image_url          text,
  target_url         text,
  cta_text           text DEFAULT 'Saiba mais',
  placement          text NOT NULL DEFAULT 'feed',
  priority           integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  status             text NOT NULL DEFAULT 'active',
  rejection_reason   text,
  audience           jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_type         text NOT NULL DEFAULT 'image',
  daily_budget_cents integer NOT NULL DEFAULT 0,
  total_spent_cents  integer NOT NULL DEFAULT 0,
  impressions_count  integer NOT NULL DEFAULT 0,
  clicks_count       integer NOT NULL DEFAULT 0,
  ai_assisted        boolean NOT NULL DEFAULT false,
  created_by_admin   boolean NOT NULL DEFAULT false,
  starts_at          timestamptz NOT NULL DEFAULT now(),
  ends_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Garante colunas em caso de instalação antiga
ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS advertiser_id      uuid,
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS rejection_reason   text,
  ADD COLUMN IF NOT EXISTS audience           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS daily_budget_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent_cents  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_assisted        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_admin   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_type         text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS impressions_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS placement          text NOT NULL DEFAULT 'feed';

-- CHECK constraints (idempotentes via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_campaigns_status_chk') THEN
    ALTER TABLE public.ad_campaigns ADD CONSTRAINT ad_campaigns_status_chk
      CHECK (status IN ('draft','pending_review','approved','rejected','active','paused','ended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_campaigns_media_chk') THEN
    ALTER TABLE public.ad_campaigns ADD CONSTRAINT ad_campaigns_media_chk
      CHECK (media_type IN ('image','video'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status_active
  ON public.ad_campaigns (status, is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser
  ON public.ad_campaigns (advertiser_id, created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_ad_campaigns_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_ad_campaigns_updated_at ON public.ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_updated_at
  BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_ad_campaigns_updated_at();

-- GRANTs
GRANT SELECT ON public.ad_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_campaigns TO authenticated;
GRANT ALL ON public.ad_campaigns TO service_role;

-- ---------- 2. TABELA DE EVENTOS: ad_interactions --------------------
CREATE TABLE IF NOT EXISTS public.ad_interactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id            uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  user_id          uuid,
  interaction_type text NOT NULL CHECK (interaction_type IN ('impression','click')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_interactions_ad_created
  ON public.ad_interactions (ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_interactions_user
  ON public.ad_interactions (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.ad_interactions TO anon, authenticated;
GRANT ALL ON public.ad_interactions TO service_role;

-- ---------- 3. RLS ---------------------------------------------------
ALTER TABLE public.ad_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active ads" ON public.ad_campaigns;
CREATE POLICY "Anyone can view active ads" ON public.ad_campaigns
  FOR SELECT
  USING (
    is_active = true
    AND status IN ('approved','active')
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  );

DROP POLICY IF EXISTS "Advertisers view own campaigns" ON public.ad_campaigns;
CREATE POLICY "Advertisers view own campaigns" ON public.ad_campaigns
  FOR SELECT TO authenticated
  USING (advertiser_id = auth.uid());

DROP POLICY IF EXISTS "Advertisers insert own campaigns" ON public.ad_campaigns;
CREATE POLICY "Advertisers insert own campaigns" ON public.ad_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (
    advertiser_id = auth.uid()
    AND created_by_admin = false
    AND status IN ('draft','pending_review')
  );

DROP POLICY IF EXISTS "Advertisers update own drafts" ON public.ad_campaigns;
CREATE POLICY "Advertisers update own drafts" ON public.ad_campaigns
  FOR UPDATE TO authenticated
  USING  (advertiser_id = auth.uid() AND status IN ('draft','pending_review','paused'))
  WITH CHECK (advertiser_id = auth.uid() AND status IN ('draft','pending_review','paused'));

-- Eventos: qualquer um pode inserir (registrado pelo RPC) — leitura só dono/admin
DROP POLICY IF EXISTS "Anyone can insert ad events" ON public.ad_interactions;
CREATE POLICY "Anyone can insert ad events" ON public.ad_interactions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Owner reads ad events" ON public.ad_interactions;
CREATE POLICY "Owner reads ad events" ON public.ad_interactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ad_campaigns c
      WHERE c.id = ad_interactions.ad_id
        AND c.advertiser_id = auth.uid()
    )
  );

-- ---------- 4. RPC: record_ad_event ---------------------------------
CREATE OR REPLACE FUNCTION public.record_ad_event(
  p_ad_id uuid,
  p_event_type text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_type NOT IN ('impression','click') THEN
    RAISE EXCEPTION 'invalid event type';
  END IF;

  INSERT INTO public.ad_interactions (ad_id, user_id, interaction_type)
  VALUES (p_ad_id, auth.uid(), p_event_type);

  IF p_event_type = 'impression' THEN
    UPDATE public.ad_campaigns
      SET impressions_count = impressions_count + 1
      WHERE id = p_ad_id;
  ELSE
    UPDATE public.ad_campaigns
      SET clicks_count = clicks_count + 1
      WHERE id = p_ad_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ad_event(uuid, text)
  TO anon, authenticated;

-- ---------- 5. VIEW de campanhas ativas -----------------------------
CREATE OR REPLACE VIEW public.v_active_sponsored_ads AS
  SELECT
    id, title, description, image_url, target_url, cta_text,
    placement, priority, audience, media_type,
    impressions_count, clicks_count,
    advertiser_id, created_by_admin,
    starts_at, ends_at, created_at
  FROM public.ad_campaigns
  WHERE is_active = true
    AND status IN ('approved','active')
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now());

GRANT SELECT ON public.v_active_sponsored_ads
  TO anon, authenticated, service_role;
