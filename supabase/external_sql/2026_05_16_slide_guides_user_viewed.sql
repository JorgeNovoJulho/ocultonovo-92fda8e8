-- ============================================================================
-- SLIDE GUIDES — Persistência do estado "Visto" no perfil do usuário (LGPD-friendly).
-- Mantém também o localStorage como cache, mas espelha em `profiles.viewed_slide_guides`
-- para refletir entre dispositivos. 100% idempotente.
-- ============================================================================

-- 1) Coluna em profiles (map slug -> epoch_ms)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS viewed_slide_guides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) RPC: marcar como visto
CREATE OR REPLACE FUNCTION public.slide_guide_mark_viewed(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_new jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'slug obrigatório';
  END IF;

  UPDATE public.profiles
     SET viewed_slide_guides = COALESCE(viewed_slide_guides, '{}'::jsonb)
                               || jsonb_build_object(p_slug, v_now)
   WHERE user_id = v_uid
  RETURNING viewed_slide_guides INTO v_new;

  RETURN COALESCE(v_new, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.slide_guide_mark_viewed(text) TO authenticated;

-- 3) RPC: redefinir TODOS
CREATE OR REPLACE FUNCTION public.slide_guide_viewed_reset()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  UPDATE public.profiles
     SET viewed_slide_guides = '{}'::jsonb
   WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.slide_guide_viewed_reset() TO authenticated;

-- 4) RPC: ler o mapa (cache cross-device)
CREATE OR REPLACE FUNCTION public.slide_guide_viewed_get()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(viewed_slide_guides, '{}'::jsonb)
    FROM public.profiles
   WHERE user_id = auth.uid()
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.slide_guide_viewed_get() TO authenticated;
