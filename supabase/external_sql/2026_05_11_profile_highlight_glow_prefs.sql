-- ============================================================
-- HIGHLIGHT GLOW PREFS — persistência server-side por usuário
-- Idempotente · External Supabase only
-- ============================================================

-- 1) Coluna de preferência (gold | rgb)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS highlight_glow_style text DEFAULT 'gold';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_highlight_glow_style_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_highlight_glow_style_check
      CHECK (highlight_glow_style IN ('gold','rgb'));
  END IF;
END$$;

-- 2) RPC para atualizar preferência (somente o próprio usuário)
CREATE OR REPLACE FUNCTION public.set_highlight_glow_style(p_style text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  IF p_style NOT IN ('gold','rgb') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_style');
  END IF;

  UPDATE public.profiles
     SET highlight_glow_style = p_style,
         updated_at = now()
   WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'style', p_style);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_highlight_glow_style(text) TO authenticated;

-- 3) RPC para ler preferência atual (atalho)
CREATE OR REPLACE FUNCTION public.get_highlight_glow_style()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(highlight_glow_style, 'gold')
    FROM public.profiles
   WHERE user_id = auth.uid()
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_highlight_glow_style() TO authenticated;
