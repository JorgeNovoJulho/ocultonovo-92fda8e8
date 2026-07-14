-- Funcao para criar novo contador Early Bird (admin)
CREATE OR REPLACE FUNCTION public.create_early_bird_counter(
  p_counter_type TEXT,
  p_max_count INTEGER DEFAULT 1000,
  p_bonus_months INTEGER DEFAULT 1,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF EXISTS (SELECT 1 FROM early_bird_counters WHERE counter_type = p_counter_type) THEN
    RAISE EXCEPTION 'Tipo de contador ja existe';
  END IF;
  
  INSERT INTO early_bird_counters (counter_type, max_count, bonus_months, is_active, current_count)
  VALUES (p_counter_type, p_max_count, p_bonus_months, p_is_active, 0)
  RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$$;

-- Funcao para deletar contador customizado (nao permite monthly/annual)
CREATE OR REPLACE FUNCTION public.delete_early_bird_counter(p_counter_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF EXISTS (SELECT 1 FROM early_bird_counters WHERE id = p_counter_id AND counter_type IN ('monthly', 'annual')) THEN
    RAISE EXCEPTION 'Nao e possivel deletar contadores padrao';
  END IF;
  
  DELETE FROM early_bird_counters WHERE id = p_counter_id;
  RETURN true;
END;
$$;