-- ============================================================
-- ADS CREATOR PRO — Fase 1
-- Estende ad_campaigns com segmentação, agendamento, template, histórico.
-- Cria galeria pública de templates (oculto_ad_templates).
-- Idempotente: pode ser executado várias vezes com segurança.
-- ============================================================

-- 1) Extensões de ad_campaigns -----------------------------------------------
ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_id uuid NULL,
  ADD COLUMN IF NOT EXISTS template_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS link_open_target text NOT NULL DEFAULT '_blank',
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Constraint segura (link_open_target só aceita _blank/_self)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ad_campaigns_link_target_chk'
  ) THEN
    ALTER TABLE public.ad_campaigns
      ADD CONSTRAINT ad_campaigns_link_target_chk
      CHECK (link_open_target IN ('_blank','_self'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_is_draft
  ON public.ad_campaigns (is_draft);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_template_id
  ON public.ad_campaigns (template_id);

-- 2) Galeria de templates -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_ad_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'promocao',
  description text,
  thumb_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id uuid NULL,
  is_public boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_templates_category
  ON public.oculto_ad_templates (category) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ad_templates_owner
  ON public.oculto_ad_templates (owner_id);

-- GRANTs (obrigatório no Supabase externo)
GRANT SELECT ON public.oculto_ad_templates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.oculto_ad_templates TO authenticated;
GRANT ALL ON public.oculto_ad_templates TO service_role;

-- RLS
ALTER TABLE public.oculto_ad_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_templates_select_public_or_own" ON public.oculto_ad_templates;
CREATE POLICY "ad_templates_select_public_or_own"
  ON public.oculto_ad_templates
  FOR SELECT
  USING (
    is_active = true AND (is_public = true OR owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "ad_templates_insert_own" ON public.oculto_ad_templates;
CREATE POLICY "ad_templates_insert_own"
  ON public.oculto_ad_templates
  FOR INSERT
  WITH CHECK (owner_id = auth.uid() OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "ad_templates_update_own" ON public.oculto_ad_templates;
CREATE POLICY "ad_templates_update_own"
  ON public.oculto_ad_templates
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "ad_templates_delete_own" ON public.oculto_ad_templates;
CREATE POLICY "ad_templates_delete_own"
  ON public.oculto_ad_templates
  FOR DELETE
  USING (owner_id = auth.uid());

-- 3) Seed mínimo de templates públicos (idempotente por nome) ----------------
INSERT INTO public.oculto_ad_templates (name, category, description, payload, is_public)
SELECT * FROM (VALUES
  ('Promoção Clássica', 'promocao',  'Layout limpo com badge de desconto',
    '{"variant":"classic","badge":"PROMO","accent":"#ec4899"}'::jsonb, true),
  ('Lançamento Bold',   'lancamento','Título grande, CTA vibrante',
    '{"variant":"bold","badge":"NOVO","accent":"#f59e0b"}'::jsonb, true),
  ('Evento VIP',        'evento',    'Foco em data e local',
    '{"variant":"event","badge":"VIP","accent":"#a855f7"}'::jsonb, true),
  ('Produto Destaque',  'produto',   'Imagem grande + preço',
    '{"variant":"product","badge":"OFERTA","accent":"#22c55e"}'::jsonb, true),
  ('Serviço Pro',       'servico',   'Tom profissional, neutro',
    '{"variant":"service","badge":"PRO","accent":"#3b82f6"}'::jsonb, true)
) AS t(name, category, description, payload, is_public)
WHERE NOT EXISTS (
  SELECT 1 FROM public.oculto_ad_templates x WHERE x.name = t.name AND x.is_public = true
);

-- 4) Trigger updated_at -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ad_templates_touch_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_templates_touch ON public.oculto_ad_templates;
CREATE TRIGGER trg_ad_templates_touch
  BEFORE UPDATE ON public.oculto_ad_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_ad_templates_touch_updated();

NOTIFY pgrst, 'reload schema';
