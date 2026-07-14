-- =====================================================
-- CORREÇÃO DE SEGURANÇA: Mais funções com search_path (parte 2)
-- =====================================================

-- 1. update_goal_contributors_count
CREATE OR REPLACE FUNCTION public.update_goal_contributors_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.creator_goals 
    SET contributors_count = COALESCE(contributors_count, 0) + 1,
        current_amount = COALESCE(current_amount, 0) + NEW.amount
    WHERE id = NEW.goal_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 2. update_polls_updated_at
CREATE OR REPLACE FUNCTION public.update_polls_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. update_hero_settings_updated_at
CREATE OR REPLACE FUNCTION public.update_hero_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4. update_site_section_timestamp
CREATE OR REPLACE FUNCTION public.update_site_section_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 5. update_cookie_consent_timestamp
CREATE OR REPLACE FUNCTION public.update_cookie_consent_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 6. update_transaction_timestamp
CREATE OR REPLACE FUNCTION public.update_transaction_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 7. update_content_reports_timestamp
CREATE OR REPLACE FUNCTION public.update_content_reports_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 8. update_auction_timestamp
CREATE OR REPLACE FUNCTION public.update_auction_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 9. update_backup_schedule_next_run
CREATE OR REPLACE FUNCTION public.update_backup_schedule_next_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.next_run_at = public.calculate_next_backup_run(
    NEW.frequency, 
    NEW.time_of_day, 
    NEW.day_of_week, 
    NEW.day_of_month
  );
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;