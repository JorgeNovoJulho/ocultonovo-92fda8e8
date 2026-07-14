-- =====================================================================
-- Fix: permitir que o usuário veja as visitas que ELE FEZ (outgoing).
-- A policy existente "Users can view visits to their profile" só cobre
-- visitas recebidas (visited_id), o que faz a seção
-- "Últimos perfis visitados" sempre retornar 0 sob RLS.
-- Idempotente.
-- =====================================================================

DROP POLICY IF EXISTS "Users can view visits they made" ON public.profile_visits;

CREATE POLICY "Users can view visits they made"
  ON public.profile_visits
  FOR SELECT
  TO authenticated
  USING (
    visitor_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
