
-- Inserir seção Early Bird no site_sections
INSERT INTO site_sections (section_key, section_name, section_type, content, is_visible, display_order)
VALUES (
  'early_bird',
  'Promoção Early Bird',
  'early_bird',
  '{
    "title": "Promoção de Carnaval 2026",
    "emoji": "🎭",
    "description": "Seja um dos 1000 primeiros e ganhe meses extras! Oferta exclusiva de Carnaval.",
    "cta_text": "Garantir Minha Vaga",
    "show_cta": true
  }'::jsonb,
  true,
  2
) ON CONFLICT (section_key) DO UPDATE SET
  section_name = EXCLUDED.section_name,
  content = EXCLUDED.content;

-- Habilitar Realtime para subscription_plans
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_plans;

-- Tabela para rastrear histórico de claims (métricas)
CREATE TABLE IF NOT EXISTS public.early_bird_claim_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  counter_id UUID REFERENCES early_bird_counters(id) ON DELETE CASCADE,
  counter_type TEXT NOT NULL,
  user_id UUID NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT now(),
  position INTEGER NOT NULL,
  bonus_months INTEGER NOT NULL
);

-- Índice para consultas de métricas
CREATE INDEX idx_early_bird_claim_history_date ON early_bird_claim_history(claimed_at);
CREATE INDEX idx_early_bird_claim_history_counter ON early_bird_claim_history(counter_id);

-- RLS
ALTER TABLE early_bird_claim_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view claim history"
  ON early_bird_claim_history FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "System can insert claim history"
  ON early_bird_claim_history FOR INSERT
  WITH CHECK (true);

-- Habilitar Realtime para histórico
ALTER PUBLICATION supabase_realtime ADD TABLE public.early_bird_claim_history;

-- Modificar claim_early_bird_slot para registrar histórico
CREATE OR REPLACE FUNCTION public.claim_early_bird_slot(p_counter_type TEXT, p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counter RECORD;
  v_new_count INTEGER;
  v_bonus_months INTEGER;
BEGIN
  -- Buscar e bloquear o contador
  SELECT * INTO v_counter
  FROM early_bird_counters
  WHERE counter_type = p_counter_type AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Promoção não encontrada ou inativa');
  END IF;

  -- Verificar se ainda há vagas
  IF v_counter.current_count >= v_counter.max_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'Todas as vagas foram preenchidas');
  END IF;

  -- Incrementar contador
  v_new_count := v_counter.current_count + 1;
  v_bonus_months := v_counter.bonus_months;

  UPDATE early_bird_counters
  SET current_count = v_new_count, updated_at = now()
  WHERE id = v_counter.id;

  -- Registrar no histórico para métricas
  INSERT INTO early_bird_claim_history (counter_id, counter_type, user_id, position, bonus_months)
  VALUES (v_counter.id, p_counter_type, p_user_id, v_new_count, v_bonus_months);

  -- Registrar na tabela de early_bird_subscriptions
  INSERT INTO early_bird_subscriptions (user_id, counter_type, bonus_months)
  VALUES (p_user_id, p_counter_type, v_bonus_months)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'position', v_new_count,
    'bonus_months', v_bonus_months,
    'remaining', v_counter.max_count - v_new_count
  );
END;
$$;
