-- =====================================================================
-- 2026-06-12 — Adiciona colunas faltantes em profiles para parar 400 no preview
--   • feed_safe_blur_enabled (bool) — preferência do Modo Blur Seguro do feed
--   • device_settings        (jsonb) — perfil de hardware/performance por device
--
-- Idempotente. Pode rodar várias vezes sem efeito colateral.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_safe_blur_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS device_settings jsonb;

COMMENT ON COLUMN public.profiles.feed_safe_blur_enabled IS
  'Preferência do usuário para o Modo Blur Seguro do feed (cobre conteúdo +18 por padrão).';

COMMENT ON COLUMN public.profiles.device_settings IS
  'Perfil detectado de hardware/performance (cpu, ram, gpu, tier) por device.';

-- RPC opcional usado pelo SafeBlurProvider para persistir a preferência
CREATE OR REPLACE FUNCTION public.set_feed_safe_blur(p_on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.profiles
     SET feed_safe_blur_enabled = COALESCE(p_on, true)
   WHERE id = auth.uid() OR user_id = auth.uid();

  RETURN COALESCE(p_on, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_feed_safe_blur(boolean) TO authenticated;

-- Notifica PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
