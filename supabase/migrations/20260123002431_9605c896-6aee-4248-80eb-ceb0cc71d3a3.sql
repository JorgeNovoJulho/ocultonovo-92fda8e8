-- 1. Remover a foreign key problemática que impede inserção de perfis seed
ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- 2. Criar função de validação que ignora perfis seed
CREATE OR REPLACE FUNCTION public.validate_profile_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Perfis seed podem ter user_id fictício
  IF NEW.is_seed = true THEN
    RETURN NEW;
  END IF;
  
  -- Perfis reais devem ter user_id válido em auth.users
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id) THEN
    RAISE EXCEPTION 'user_id % não existe em auth.users', NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 3. Criar trigger de validação
DROP TRIGGER IF EXISTS trigger_validate_profile_user_id ON public.profiles;
CREATE TRIGGER trigger_validate_profile_user_id
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_profile_user_id();