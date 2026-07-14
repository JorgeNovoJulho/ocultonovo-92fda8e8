-- ============================================================
-- Notificações: nota de avaliação, depoimento e recomendação real
-- Idempotente. Roda no SQL Editor do Supabase EXTERNO.
-- ============================================================

-- 1) Função genérica para enviar notificação social a um perfil
CREATE OR REPLACE FUNCTION public.notify_profile_social_event(
  p_target_profile_id uuid,
  p_actor_profile_id  uuid,
  p_type              text,
  p_title             text,
  p_body              text,
  p_extra             jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user uuid;
  v_actor_user  uuid;
  v_actor_user_name text;
BEGIN
  IF p_target_profile_id IS NULL OR p_actor_profile_id IS NULL THEN
    RETURN;
  END IF;
  -- Não notifica a si mesmo
  IF p_target_profile_id = p_actor_profile_id THEN
    RETURN;
  END IF;

  SELECT user_id INTO v_target_user FROM public.profiles WHERE id = p_target_profile_id;
  SELECT user_id, COALESCE(username, name, '') INTO v_actor_user, v_actor_user_name
    FROM public.profiles WHERE id = p_actor_profile_id;

  IF v_target_user IS NULL THEN RETURN; END IF;

  INSERT INTO public.notifications (user_id, actor_id, type, title, body, data, is_read)
  VALUES (
    v_target_user,
    v_actor_user,
    p_type,
    p_title,
    p_body,
    jsonb_build_object(
      'actor_id', v_actor_user,
      'actor_profile_id', p_actor_profile_id,
      'target_profile_id', p_target_profile_id,
      'actor_username', v_actor_user_name
    ) || COALESCE(p_extra, '{}'::jsonb),
    false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_profile_social_event(uuid,uuid,text,text,text,jsonb) TO authenticated, service_role;

-- 2) Trigger: nota de avaliação recebida
CREATE OR REPLACE FUNCTION public.trg_notify_rating_received()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_profile_social_event(
    NEW.target_profile_id,
    NEW.rater_profile_id,
    'rating_received',
    'Nova avaliação no seu perfil',
    'Você recebeu uma nota de ' || NEW.stars::text || ' ★',
    jsonb_build_object('stars', NEW.stars, 'section', 'rating')
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oculto_profile_ratings_notify ON public.oculto_profile_ratings;
CREATE TRIGGER trg_oculto_profile_ratings_notify
AFTER INSERT OR UPDATE OF stars ON public.oculto_profile_ratings
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_rating_received();

-- 3) Trigger: depoimento recebido
CREATE OR REPLACE FUNCTION public.trg_notify_testimonial_received()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_profile_social_event(
    NEW.target_profile_id,
    NEW.author_profile_id,
    'testimonial_received',
    'Você recebeu um depoimento',
    LEFT(NEW.content, 140),
    jsonb_build_object('testimonial_id', NEW.id, 'section', 'testimonials')
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oculto_profile_testimonials_notify ON public.oculto_profile_testimonials;
CREATE TRIGGER trg_oculto_profile_testimonials_notify
AFTER INSERT ON public.oculto_profile_testimonials
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_testimonial_received();

-- 4) Trigger: recomendação real recebida
CREATE OR REPLACE FUNCTION public.trg_notify_real_rec_received()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_profile_social_event(
    NEW.target_profile_id,
    NEW.recommender_profile_id,
    'recommendation_received',
    'Recomendação como real',
    'Alguém recomendou você como real',
    jsonb_build_object('section', 'recommendations')
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oculto_real_recommendations_notify ON public.oculto_real_recommendations;
CREATE TRIGGER trg_oculto_real_recommendations_notify
AFTER INSERT ON public.oculto_real_recommendations
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_real_rec_received();

-- 5) (Opcional) Garante realtime das tabelas sociais (caso ainda não esteja)
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_profile_ratings;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_profile_testimonials;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_real_recommendations;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
