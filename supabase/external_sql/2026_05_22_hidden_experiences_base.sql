-- ============================================================================
-- EXPERIÊNCIAS OCULTAS — Base estrutural (Etapa 1–3 do plano)
-- Função interna, separada do Aura Match e das salas públicas.
-- Por padrão fica INVISÍVEL para todos. Apenas o admin master vê.
-- O master pode liberar individualmente via selected_users e/ou allowed_plans.
--
-- Idempotente: pode rodar quantas vezes precisar.
-- Rodar manualmente no SQL Editor do Supabase EXTERNO
-- (rvybbrkzmboqbhcemqar.supabase.co).
-- ============================================================================

-- 1) Tabela de configuração (linha única) -----------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_hidden_experiences_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled         boolean NOT NULL DEFAULT false,        -- master switch global
  beta_mode       boolean NOT NULL DEFAULT true,         -- enquanto true, só selected_users + master
  allowed_plans   text[]  NOT NULL DEFAULT ARRAY[]::text[], -- ex.: ARRAY['premium','vip']
  selected_users  uuid[]  NOT NULL DEFAULT ARRAY[]::uuid[],  -- profiles.user_id liberados
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Garante linha única
INSERT INTO public.oculto_hidden_experiences_config (enabled, beta_mode)
SELECT false, true
WHERE NOT EXISTS (SELECT 1 FROM public.oculto_hidden_experiences_config);

-- 2) RLS ---------------------------------------------------------------------
ALTER TABLE public.oculto_hidden_experiences_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hidden_exp_cfg_master_all" ON public.oculto_hidden_experiences_config;
CREATE POLICY "hidden_exp_cfg_master_all"
  ON public.oculto_hidden_experiences_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

-- Leitura para o próprio usuário verificar se ele está liberado (sem ler config inteira)
-- → não criamos policy de SELECT pública; acesso via RPC SECURITY DEFINER abaixo.

-- 3) RPC: can_access_hidden_experiences(uid) --------------------------------
CREATE OR REPLACE FUNCTION public.can_access_hidden_experiences(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cfg public.oculto_hidden_experiences_config;
  plan text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  -- Admin master sempre passa
  IF public.has_role(_user_id, 'admin_master') THEN
    RETURN true;
  END IF;

  SELECT * INTO cfg
    FROM public.oculto_hidden_experiences_config
    ORDER BY created_at LIMIT 1;

  IF cfg IS NULL OR cfg.enabled = false THEN
    RETURN false;
  END IF;

  -- Beta: somente lista explícita
  IF cfg.beta_mode = true THEN
    RETURN _user_id = ANY(cfg.selected_users);
  END IF;

  -- Fora do beta: selected_users OU plano permitido
  IF _user_id = ANY(cfg.selected_users) THEN
    RETURN true;
  END IF;

  IF array_length(cfg.allowed_plans, 1) IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.plan_type INTO plan
    FROM public.profiles p
    WHERE p.user_id = _user_id
    LIMIT 1;

  RETURN COALESCE(plan, 'free') = ANY(cfg.allowed_plans);
END $$;

GRANT EXECUTE ON FUNCTION public.can_access_hidden_experiences(uuid) TO anon, authenticated;

-- 4) RPC pública de leitura da config (somente master) ----------------------
CREATE OR REPLACE FUNCTION public.hidden_experiences_get_config()
RETURNS public.oculto_hidden_experiences_config
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE cfg public.oculto_hidden_experiences_config;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cfg FROM public.oculto_hidden_experiences_config ORDER BY created_at LIMIT 1;
  RETURN cfg;
END $$;

GRANT EXECUTE ON FUNCTION public.hidden_experiences_get_config() TO authenticated;

-- 5) RPC de update (somente master) -----------------------------------------
CREATE OR REPLACE FUNCTION public.hidden_experiences_update_config(
  _enabled        boolean,
  _beta_mode      boolean,
  _allowed_plans  text[],
  _selected_users uuid[],
  _notes          text DEFAULT NULL
) RETURNS public.oculto_hidden_experiences_config
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE cfg public.oculto_hidden_experiences_config;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.oculto_hidden_experiences_config
     SET enabled        = COALESCE(_enabled, enabled),
         beta_mode      = COALESCE(_beta_mode, beta_mode),
         allowed_plans  = COALESCE(_allowed_plans, allowed_plans),
         selected_users = COALESCE(_selected_users, selected_users),
         notes          = COALESCE(_notes, notes),
         updated_at     = now()
   WHERE id = (SELECT id FROM public.oculto_hidden_experiences_config ORDER BY created_at LIMIT 1)
   RETURNING * INTO cfg;

  RETURN cfg;
END $$;

GRANT EXECUTE ON FUNCTION public.hidden_experiences_update_config(boolean,boolean,text[],uuid[],text) TO authenticated;

NOTIFY pgrst, 'reload schema';
