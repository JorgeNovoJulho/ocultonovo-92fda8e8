-- ================================================
-- FASE 5.16: CORRIGIR FUNÇÕES RESTANTES COM SEARCH_PATH
-- ================================================

-- Corrigir funções que ainda não têm search_path definido
CREATE OR REPLACE FUNCTION public.calculate_priority_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.priority_score := CASE
    WHEN NEW.is_urgent THEN 100
    WHEN NEW.severity = 'critical' THEN 80
    WHEN NEW.severity = 'high' THEN 60
    WHEN NEW.severity = 'medium' THEN 40
    ELSE 20
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_creator_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE profiles 
    SET total_earnings = COALESCE(total_earnings, 0) + NEW.amount
    WHERE id = NEW.creator_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_post_engagement_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_likes integer;
  v_comments integer;
  v_views integer;
BEGIN
  SELECT 
    COALESCE(COUNT(DISTINCT pl.id), 0),
    COALESCE(COUNT(DISTINCT pc.id), 0)
  INTO v_likes, v_comments
  FROM posts p
  LEFT JOIN post_likes pl ON pl.post_id = p.id
  LEFT JOIN post_comments pc ON pc.post_id = p.id
  WHERE p.id = COALESCE(NEW.post_id, OLD.post_id);
  
  UPDATE posts 
  SET engagement_score = (v_likes * 2) + (v_comments * 3) + COALESCE(views_count, 0)
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_unlock_album()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    UPDATE time_locked_albums 
    SET is_unlocked = true, unlocked_at = now()
    WHERE id = NEW.album_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification_for_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Placeholder for notification creation logic
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_subscription_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ends_at IS NOT NULL AND NEW.ends_at < NEW.starts_at THEN
    RAISE EXCEPTION 'End date must be after start date';
  END IF;
  RETURN NEW;
END;
$$;