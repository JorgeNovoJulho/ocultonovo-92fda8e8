
-- =====================================================
-- AUDITORIA DE SEGURANÇA COMPLETA - OCULTO SWING (v3)
-- =====================================================

-- 1. CONVERTER VIEWS PARA SECURITY INVOKER
ALTER VIEW public.profiles_public SET (security_invoker = on);
ALTER VIEW public.v_secure_posts SET (security_invoker = on);
ALTER VIEW public.v_vip_stats SET (security_invoker = on);
ALTER VIEW public.creator_earnings_summary SET (security_invoker = on);
ALTER VIEW public.ab_experiment_results SET (security_invoker = on);
ALTER VIEW public.admin_financial_master_view SET (security_invoker = on);

-- 2. CORRIGIR FUNÇÕES SEM search_path
CREATE OR REPLACE FUNCTION public.calculate_next_backup_run(
  p_frequency text, p_time_of_day time, p_day_of_week integer DEFAULT NULL, p_day_of_month integer DEFAULT NULL
) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE next_run timestamptz; today_run timestamptz;
BEGIN
  today_run := (CURRENT_DATE + p_time_of_day)::timestamptz;
  CASE p_frequency
    WHEN 'daily' THEN
      IF today_run > now() THEN next_run := today_run; ELSE next_run := today_run + interval '1 day'; END IF;
    WHEN 'weekly' THEN
      next_run := today_run + ((p_day_of_week - EXTRACT(DOW FROM CURRENT_DATE))::integer % 7) * interval '1 day';
      IF next_run <= now() THEN next_run := next_run + interval '7 days'; END IF;
    WHEN 'monthly' THEN
      next_run := (date_trunc('month', CURRENT_DATE) + (COALESCE(p_day_of_month, 1) - 1) * interval '1 day' + p_time_of_day)::timestamptz;
      IF next_run <= now() THEN next_run := next_run + interval '1 month'; END IF;
    ELSE next_run := today_run + interval '1 day';
  END CASE;
  RETURN next_run;
END; $$;

DROP FUNCTION IF EXISTS public.generate_referral_code();
CREATE FUNCTION public.generate_referral_code() RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE code text; exists_already boolean;
BEGIN
  LOOP
    code := upper(substring(md5(random()::text) from 1 for 8));
    SELECT EXISTS(SELECT 1 FROM creator_referrals WHERE referral_code = code) INTO exists_already;
    IF NOT exists_already THEN RETURN code; END IF;
  END LOOP;
END; $$;

-- 3. CORRIGIR POLÍTICAS RLS PERMISSIVAS (system → service_role)
DROP POLICY IF EXISTS "System can manage assignments" ON public.ab_assignments;
CREATE POLICY "Service role manages assignments" ON public.ab_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert conversions" ON public.ab_conversions;
CREATE POLICY "Service role inserts conversions" ON public.ab_conversions FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert campaign executions" ON public.campaign_executions;
DROP POLICY IF EXISTS "System can update campaign executions" ON public.campaign_executions;
CREATE POLICY "Service role manages campaign executions" ON public.campaign_executions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert health logs" ON public.checkout_health_logs;
CREATE POLICY "Service role inserts health logs" ON public.checkout_health_logs FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can create incidents" ON public.checkout_incidents;
CREATE POLICY "Service role creates incidents" ON public.checkout_incidents FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert edit history" ON public.comment_edit_history;
CREATE POLICY "Users insert own edit history" ON public.comment_edit_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = edited_by);

DROP POLICY IF EXISTS "Sistema pode inserir eventos de conversão" ON public.conversion_events;
CREATE POLICY "Service role inserts conversion events" ON public.conversion_events FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert commissions" ON public.creator_referral_commissions;
CREATE POLICY "Service role inserts commissions" ON public.creator_referral_commissions FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert referrals" ON public.creator_referrals;
DROP POLICY IF EXISTS "System can update referrals" ON public.creator_referrals;
CREATE POLICY "Service role manages referrals" ON public.creator_referrals FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert claim history" ON public.early_bird_claim_history;
CREATE POLICY "Service role inserts claim history" ON public.early_bird_claim_history FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service can insert matches" ON public.looking_now_matches;
CREATE POLICY "Service role inserts matches" ON public.looking_now_matches FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can update view count" ON public.media_share_links;
CREATE POLICY "Authenticated update share links" ON public.media_share_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert payment reminders" ON public.payment_reminders;
CREATE POLICY "Service role inserts payment reminders" ON public.payment_reminders FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System insert plan changes" ON public.plan_change_logs;
CREATE POLICY "Service role inserts plan changes" ON public.plan_change_logs FOR INSERT TO service_role WITH CHECK (true);

-- promotion_events: sem user_id, restringir para authenticated
DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.promotion_events;
CREATE POLICY "Authenticated insert promotion events" ON public.promotion_events FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert activities" ON public.public_activities;
CREATE POLICY "Service role inserts activities" ON public.public_activities FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can create clicks" ON public.referral_clicks;
CREATE POLICY "Service role inserts referral clicks" ON public.referral_clicks FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert referral_tree" ON public.referral_tree;
CREATE POLICY "Service role inserts referral tree" ON public.referral_tree FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert share clicks" ON public.share_click_tracking;
CREATE POLICY "Service role inserts share clicks" ON public.share_click_tracking FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can manage credits" ON public.user_credits;
CREATE POLICY "Service role manages credits" ON public.user_credits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read own credits" ON public.user_credits FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can manage reengagement history" ON public.user_reengagement_history;
CREATE POLICY "Service role manages reengagement" ON public.user_reengagement_history FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "System can update jobs" ON public.video_transcoding_jobs;
CREATE POLICY "Service role updates transcoding jobs" ON public.video_transcoding_jobs FOR UPDATE TO service_role USING (true);

-- 4. PROTEGER DADOS SENSÍVEIS
DROP POLICY IF EXISTS "Anyone can read consents" ON public.cookie_consents;
DROP POLICY IF EXISTS "Users can read own consents" ON public.cookie_consents;
CREATE POLICY "Users read own cookie consents" ON public.cookie_consents FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can view comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Public can view comment likes" ON public.comment_likes;
CREATE POLICY "Authenticated view comment likes" ON public.comment_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view goals" ON public.creator_goals;
DROP POLICY IF EXISTS "Public can view active goals" ON public.creator_goals;
CREATE POLICY "Authenticated view active goals" ON public.creator_goals FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can view activities" ON public.public_activities;
DROP POLICY IF EXISTS "Public can view activities" ON public.public_activities;
CREATE POLICY "Authenticated view activities" ON public.public_activities FOR SELECT TO authenticated USING (true);

-- waitlist e founder apps: manter público mas restringir roles
DROP POLICY IF EXISTS "Anyone can add to waitlist" ON public.waitlist;
CREATE POLICY "Anyone can add to waitlist" ON public.waitlist FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can submit founder application" ON public.creator_founder_applications;
CREATE POLICY "Anyone can submit founder application" ON public.creator_founder_applications FOR INSERT TO anon, authenticated WITH CHECK (true);
