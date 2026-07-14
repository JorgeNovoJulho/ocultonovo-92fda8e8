-- 1. Habilitar Realtime para early_bird_counters
ALTER PUBLICATION supabase_realtime ADD TABLE public.early_bird_counters;

-- 2. Função para reiniciar contador Early Bird (somente admin)
CREATE OR REPLACE FUNCTION public.reset_early_bird_counter(
  p_counter_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  UPDATE early_bird_counters
  SET current_count = 0, updated_at = now()
  WHERE id = p_counter_id;
  
  RETURN true;
END;
$$;