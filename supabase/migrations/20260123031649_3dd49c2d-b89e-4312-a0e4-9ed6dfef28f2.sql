-- Adicionar campos de gestão disciplinar ao profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS warning_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS frozen_until timestamp with time zone,
ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active' CHECK (account_status IN ('active', 'frozen', 'banned')),
ADD COLUMN IF NOT EXISTS banned_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS banned_by uuid,
ADD COLUMN IF NOT EXISTS ban_reason text;

-- Criar tabela de histórico disciplinar
CREATE TABLE IF NOT EXISTS public.discipline_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('freeze', 'unfreeze', 'ban', 'restore', 'warning', 'grant_plan')),
  admin_id uuid NOT NULL,
  reason text,
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.discipline_history ENABLE ROW LEVEL SECURITY;

-- Policies para discipline_history
CREATE POLICY "Admins can view discipline history"
ON public.discipline_history FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can create discipline records"
ON public.discipline_history FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Função para verificar e aplicar ban automático (3 strikes)
CREATE OR REPLACE FUNCTION public.check_auto_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.warning_count >= 3 AND NEW.account_status != 'banned' THEN
    NEW.account_status := 'banned';
    NEW.banned_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger para auto-ban
DROP TRIGGER IF EXISTS trigger_auto_ban ON public.profiles;
CREATE TRIGGER trigger_auto_ban
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_auto_ban();

-- Função para descongelar automaticamente
CREATE OR REPLACE FUNCTION public.check_freeze_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_status = 'frozen' AND NEW.frozen_until IS NOT NULL AND NEW.frozen_until < now() THEN
    NEW.account_status := 'active';
    NEW.frozen_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger para verificar expiração do congelamento
DROP TRIGGER IF EXISTS trigger_check_freeze ON public.profiles;
CREATE TRIGGER trigger_check_freeze
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_freeze_expiration();