-- ================================================
-- FASE 5.17: CORRIGIR POLÍTICAS RLS PERMISSIVAS
-- ================================================

-- 1. Corrigir políticas "always true" em tabelas críticas

-- achievements - apenas autenticados podem inserir conquistas
DROP POLICY IF EXISTS "Anyone can insert achievements" ON public.achievements;
DROP POLICY IF EXISTS "Admins can manage achievements" ON public.achievements;
CREATE POLICY "Admins can manage achievements" ON public.achievements
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- badges - apenas admins podem gerenciar
DROP POLICY IF EXISTS "Anyone can insert badges" ON public.badges;
DROP POLICY IF EXISTS "Admins can manage badges" ON public.badges;
CREATE POLICY "Admins can manage badges" ON public.badges
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ad_campaigns - apenas admins podem gerenciar
DROP POLICY IF EXISTS "Anyone can manage ad campaigns" ON public.ad_campaigns;
DROP POLICY IF EXISTS "Admins can manage ad campaigns" ON public.ad_campaigns;
CREATE POLICY "Admins can manage ad campaigns" ON public.ad_campaigns
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ab_experiments - apenas admins podem gerenciar
DROP POLICY IF EXISTS "Anyone can manage experiments" ON public.ab_experiments;
DROP POLICY IF EXISTS "Admins can manage experiments" ON public.ab_experiments;
CREATE POLICY "Admins can manage experiments" ON public.ab_experiments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2. Corrigir tabelas de analytics - apenas leitura para admins
DROP POLICY IF EXISTS "Anyone can insert analytics" ON public.analytics_snapshots;
DROP POLICY IF EXISTS "Admins can manage analytics" ON public.analytics_snapshots;
CREATE POLICY "Admins can manage analytics" ON public.analytics_snapshots
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3. Corrigir cohort_data
DROP POLICY IF EXISTS "Anyone can insert cohort data" ON public.cohort_data;
DROP POLICY IF EXISTS "Admins can manage cohort data" ON public.cohort_data;
CREATE POLICY "Admins can manage cohort data" ON public.cohort_data
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4. Corrigir audit_logs - apenas admins podem ver
DROP POLICY IF EXISTS "Anyone can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid());

-- 5. Corrigir admin_notifications
DROP POLICY IF EXISTS "Anyone can manage admin notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "Admins can manage admin notifications" ON public.admin_notifications;
CREATE POLICY "Admins can manage admin notifications" ON public.admin_notifications
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));