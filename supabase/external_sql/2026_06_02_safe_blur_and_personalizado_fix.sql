-- ============================================================
-- Modo Blur Seguro do Feed + correção definitiva do modo Personalizado
-- Externo: rvybbrkzmboqbhcemqar.supabase.co
-- Idempotente — pode rodar quantas vezes precisar
-- ============================================================

-- 1) Preferência por usuário (default LIGADO) -----------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_safe_blur_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.feed_safe_blur_enabled IS
  'Se TRUE, o feed do usuário cobre cada post com um overlay de aviso "conteúdo adulto" (modo seguro para uso em público).';

-- 2) RPC para alternar o modo --------------------------------
CREATE OR REPLACE FUNCTION public.set_feed_safe_blur(p_on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
     SET feed_safe_blur_enabled = COALESCE(p_on, true)
   WHERE id = v_uid OR user_id = v_uid;

  RETURN COALESCE(p_on, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_feed_safe_blur(boolean) TO authenticated;

-- 3) Correção definitiva do modo "personalizado" -------------
-- 3a) Recria o CHECK do feed_mode incluindo 'personalizado'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_feed_mode_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_feed_mode_check
  CHECK (feed_mode IN ('completo','social','descoberta','limpo','card','personalizado'));

-- 3b) Garante o seed do modo 'personalizado' habilitado
INSERT INTO public.oculto_feed_modes_config
  (mode_id, label, description, enabled, min_plan, sort_order)
VALUES
  ('personalizado','Personalizado','Você escolhe quais blocos do feed aparecem', true, 'free', 60)
ON CONFLICT (mode_id) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      enabled = true,
      min_plan = EXCLUDED.min_plan,
      sort_order = EXCLUDED.sort_order;

-- 3c) Coluna do mapa de widgets (caso ainda não exista)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_widgets_custom jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3d) RPC para salvar os toggles (idempotente)
CREATE OR REPLACE FUNCTION public.set_feed_widgets_custom(p_widgets jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  UPDATE public.profiles
     SET feed_widgets_custom = COALESCE(p_widgets, '{}'::jsonb)
   WHERE id = auth.uid() OR user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_feed_widgets_custom(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
