-- ================================================
-- FASE 5.18: CORREÇÕES RLS (SEM TABELAS INEXISTENTES)
-- ================================================

-- 1. Corrigir user_achievements
DROP POLICY IF EXISTS "Anyone can insert user achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Users can view own achievements" ON public.user_achievements;
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "System can grant achievements" ON public.user_achievements;
CREATE POLICY "System can grant achievements" ON public.user_achievements
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 2. Corrigir user_badges
DROP POLICY IF EXISTS "Anyone can insert user badges" ON public.user_badges;
DROP POLICY IF EXISTS "Users can view own badges" ON public.user_badges;
CREATE POLICY "Users can view own badges" ON public.user_badges
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "System can grant badges" ON public.user_badges;
CREATE POLICY "System can grant badges" ON public.user_badges
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 3. Corrigir anonymous_reports - apenas admins podem gerenciar
DROP POLICY IF EXISTS "Anyone can insert reports" ON public.anonymous_reports;
DROP POLICY IF EXISTS "Anyone can create reports" ON public.anonymous_reports;
CREATE POLICY "Anyone can create reports" ON public.anonymous_reports
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage reports" ON public.anonymous_reports;
CREATE POLICY "Admins can manage reports" ON public.anonymous_reports
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- 4. Corrigir checkout_health_logs
DROP POLICY IF EXISTS "Anyone can manage checkout health" ON public.checkout_health_logs;
DROP POLICY IF EXISTS "Admins can manage checkout health" ON public.checkout_health_logs;
CREATE POLICY "Admins can manage checkout health" ON public.checkout_health_logs
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. Corrigir checkout_incidents
DROP POLICY IF EXISTS "Anyone can manage checkout incidents" ON public.checkout_incidents;
DROP POLICY IF EXISTS "Admins can manage checkout incidents" ON public.checkout_incidents;
CREATE POLICY "Admins can manage checkout incidents" ON public.checkout_incidents
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 6. Corrigir churn_alerts
DROP POLICY IF EXISTS "Anyone can manage churn alerts" ON public.churn_alerts;
DROP POLICY IF EXISTS "Admins can manage churn alerts" ON public.churn_alerts;
CREATE POLICY "Admins can manage churn alerts" ON public.churn_alerts
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));