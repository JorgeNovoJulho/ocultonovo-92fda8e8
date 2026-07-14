-- ============================================================================
-- Oculto Swing — Templates personalizados do Editor de Anúncios (Ads Creator)
-- Arquivo: 2026_05_30_oculto_ad_templates.sql
-- Cole no SQL Editor do Supabase EXTERNO. Idempotente (re-executável).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_ad_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL,
  name        TEXT NOT NULL,
  thumbnail   TEXT,                          -- dataURL (base64) ou URL pública
  doc         JSONB NOT NULL,                -- AdDoc completo (com pages)
  width       INTEGER NOT NULL DEFAULT 1080,
  height      INTEGER NOT NULL DEFAULT 1350,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants explícitos (regra: sem isso a Data API retorna permission denied)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_ad_templates TO authenticated;
GRANT SELECT ON public.oculto_ad_templates TO anon;     -- somente públicos via RLS
GRANT ALL    ON public.oculto_ad_templates TO service_role;

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_oculto_ad_templates_owner
  ON public.oculto_ad_templates (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_ad_templates_public
  ON public.oculto_ad_templates (is_public, updated_at DESC) WHERE is_public = true;

-- RLS
ALTER TABLE public.oculto_ad_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oculto_ad_templates_select_own_or_public"
  ON public.oculto_ad_templates;
CREATE POLICY "oculto_ad_templates_select_own_or_public"
  ON public.oculto_ad_templates
  FOR SELECT
  USING (
    is_public = true
    OR (auth.uid() IS NOT NULL AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "oculto_ad_templates_insert_own"
  ON public.oculto_ad_templates;
CREATE POLICY "oculto_ad_templates_insert_own"
  ON public.oculto_ad_templates
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

DROP POLICY IF EXISTS "oculto_ad_templates_update_own"
  ON public.oculto_ad_templates;
CREATE POLICY "oculto_ad_templates_update_own"
  ON public.oculto_ad_templates
  FOR UPDATE
  USING (auth.uid() IS NOT NULL AND owner_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

DROP POLICY IF EXISTS "oculto_ad_templates_delete_own"
  ON public.oculto_ad_templates;
CREATE POLICY "oculto_ad_templates_delete_own"
  ON public.oculto_ad_templates
  FOR DELETE
  USING (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- Trigger de updated_at (reutiliza função genérica se existir, senão cria)
CREATE OR REPLACE FUNCTION public.tg_oculto_ad_templates_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_ad_templates_updated_at
  ON public.oculto_ad_templates;
CREATE TRIGGER trg_oculto_ad_templates_updated_at
  BEFORE UPDATE ON public.oculto_ad_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_oculto_ad_templates_set_updated_at();

-- ============================================================================
-- FIM
-- ============================================================================
