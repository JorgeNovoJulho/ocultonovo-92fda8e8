-- 1. Recriar a tabela de configurações do alerta (essencial para a imagem 2)
CREATE TABLE IF NOT EXISTS public.oculto_master_alert_settings (
  id                  text PRIMARY KEY DEFAULT 'singleton',
  enabled             boolean NOT NULL DEFAULT true,
  sound_preset        text    NOT NULL DEFAULT 'bell',
  sound_url           text,
  volume              numeric(3,2) NOT NULL DEFAULT 0.80,
  recurrence_seconds  integer NOT NULL DEFAULT 60,
  auto_open_modal     boolean NOT NULL DEFAULT true,
  last_triggered_at   timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oculto_master_alert_settings_singleton CHECK (id = 'singleton')
);

-- Garantir permissões básicas
GRANT SELECT, INSERT, UPDATE ON public.oculto_master_alert_settings TO authenticated;
GRANT ALL ON public.oculto_master_alert_settings TO service_role;

ALTER TABLE public.oculto_master_alert_settings ENABLE ROW LEVEL SECURITY;

-- Política de acesso total baseada no ID Master ou Username
DROP POLICY IF EXISTS "Master full access to alert settings" ON public.oculto_master_alert_settings;
CREATE POLICY "Master full access to alert settings" 
ON public.oculto_master_alert_settings 
FOR ALL 
USING (
  auth.uid() = 'be455097-5673-409d-b572-7b04d04a1cb1' OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE (id = auth.uid() OR user_id = auth.uid()) AND lower(username) = 'ocultomaster'
  )
)
WITH CHECK (
  auth.uid() = 'be455097-5673-409d-b572-7b04d04a1cb1' OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE (id = auth.uid() OR user_id = auth.uid()) AND lower(username) = 'ocultomaster'
  )
);

-- Inserir linha inicial se não existir
INSERT INTO public.oculto_master_alert_settings (id)
VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

-- 2. Corrigir a função de listagem para bater 100% com o contador do card (Imagem 1)
CREATE OR REPLACE FUNCTION public.master_online_unrewarded_get()
RETURNS TABLE (
  profile_id     uuid,
  user_id        uuid,
  username       text,
  name           text,
  avatar_url     text,
  plan_type      text,
  aura_level     integer,
  last_seen      timestamptz,
  already_gifted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_online_cutoff    timestamptz := now() - interval '2 minutes';
BEGIN
  RETURN QUERY
  SELECT
    p.id                                                          AS profile_id,
    p.user_id                                                     AS user_id,
    p.username                                                    AS username,
    p.name                                                        AS name,
    p.avatar_url                                                  AS avatar_url,
    p.plan_type                                                   AS plan_type,
    p.aura_level                                                  AS aura_level,
    p.last_seen                                                   AS last_seen,
    EXISTS (
      SELECT 1 FROM public.oculto_aura_xp_gifts g
       WHERE g.sender_id   = v_uid
         AND g.receiver_id = p.id
    )                                                             AS already_gifted
  FROM public.profiles p
  WHERE p.is_online   = true
    AND (p.last_seen  >= v_online_cutoff OR p.last_activity_at >= v_online_cutoff)
    AND COALESCE(p.is_seed, false) = false
    AND p.banned_at IS NULL
    AND (p.username IS NULL OR lower(p.username) <> 'ocultomaster')
  ORDER BY p.last_seen DESC NULLS LAST
  LIMIT 500;
END;
$$;
