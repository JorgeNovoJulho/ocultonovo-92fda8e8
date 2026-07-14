-- ============================================================================
-- SOCIAL: TRIGGERS AUTOMÁTICOS + RPC DE DESCONTO DINÂMICO
-- 100% idempotente — cole no SQL Editor do Supabase EXTERNO
-- Pré-requisito: rodar antes 2026_05_10_social_trust_system.sql
-- ============================================================================

-- Helper: descobre o user_id correto (id ou user_id) e ignora seeds
CREATE OR REPLACE FUNCTION public._social_resolve_uid(p_any uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM profiles p
   WHERE (p.id = p_any OR p.user_id = p_any)
     AND coalesce(p.is_seed, false) = false
   LIMIT 1;
$$;

-- ============================================================================
-- TRIGGERS — só criados se a tabela alvo existir, e só se o trigger ainda não existir
-- ============================================================================

-- LIKES recebidos
DO $$
DECLARE v_tbl text;
BEGIN
  FOR v_tbl IN SELECT unnest(ARRAY['post_likes','posts_likes','likes']) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=v_tbl) THEN
      EXECUTE format($f$
        CREATE OR REPLACE FUNCTION public._trg_social_like_award() RETURNS trigger
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
        DECLARE v_owner uuid; v_post_id uuid; v_col text;
        BEGIN
          v_post_id := COALESCE(NEW.post_id, NEW.id);
          SELECT author_id INTO v_owner FROM posts WHERE id = v_post_id;
          IF v_owner IS NOT NULL THEN
            PERFORM public.social_score_award(public._social_resolve_uid(v_owner), 'like_received', v_post_id::text);
          END IF;
          RETURN NEW;
        END; $body$;
      $f$);
      EXECUTE format('DROP TRIGGER IF EXISTS trg_social_like_award ON public.%I', v_tbl);
      EXECUTE format('CREATE TRIGGER trg_social_like_award AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public._trg_social_like_award()', v_tbl);
      EXIT;
    END IF;
  END LOOP;
END $$;

-- COMENTÁRIOS recebidos
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_comments') THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public._trg_social_comment_award() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
      DECLARE v_owner uuid;
      BEGIN
        SELECT author_id INTO v_owner FROM posts WHERE id = NEW.post_id;
        IF v_owner IS NOT NULL THEN
          PERFORM public.social_score_award(public._social_resolve_uid(v_owner), 'comment_received', NEW.id::text);
        END IF;
        RETURN NEW;
      END; $body$;
    $f$;
    DROP TRIGGER IF EXISTS trg_social_comment_award ON public.post_comments;
    CREATE TRIGGER trg_social_comment_award AFTER INSERT ON public.post_comments
      FOR EACH ROW EXECUTE FUNCTION public._trg_social_comment_award();
  END IF;
END $$;

-- SEGUIDORES ganhos
DO $$
DECLARE v_tbl text;
BEGIN
  FOR v_tbl IN SELECT unnest(ARRAY['follows','followers','user_follows']) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=v_tbl) THEN
      EXECUTE format($f$
        CREATE OR REPLACE FUNCTION public._trg_social_follow_award() RETURNS trigger
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
        DECLARE v_target uuid;
        BEGIN
          v_target := COALESCE(NEW.followed_id, NEW.following_id, NEW.target_id, NEW.followee_id);
          IF v_target IS NOT NULL THEN
            PERFORM public.social_score_award(public._social_resolve_uid(v_target), 'follower_gained', NEW.id::text);
          END IF;
          RETURN NEW;
        END; $body$;
      $f$);
      EXECUTE format('DROP TRIGGER IF EXISTS trg_social_follow_award ON public.%I', v_tbl);
      EXECUTE format('CREATE TRIGGER trg_social_follow_award AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public._trg_social_follow_award()', v_tbl);
      EXIT;
    END IF;
  END LOOP;
END $$;

-- POSTS criados
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='posts') THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public._trg_social_post_created_award() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
      BEGIN
        IF NEW.author_id IS NOT NULL THEN
          PERFORM public.social_score_award(public._social_resolve_uid(NEW.author_id), 'post_created', NEW.id::text);
        END IF;
        RETURN NEW;
      END; $body$;
    $f$;
    DROP TRIGGER IF EXISTS trg_social_post_created_award ON public.posts;
    CREATE TRIGGER trg_social_post_created_award AFTER INSERT ON public.posts
      FOR EACH ROW EXECUTE FUNCTION public._trg_social_post_created_award();
  END IF;
END $$;

-- KYC concluído (verifications)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='verifications') THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public._trg_social_verif_award() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
      BEGIN
        IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
          PERFORM public.social_score_award(public._social_resolve_uid(NEW.user_id), 'verification_done', NEW.id::text);
        END IF;
        RETURN NEW;
      END; $body$;
    $f$;
    DROP TRIGGER IF EXISTS trg_social_verif_award ON public.verifications;
    CREATE TRIGGER trg_social_verif_award AFTER UPDATE ON public.verifications
      FOR EACH ROW EXECUTE FUNCTION public._trg_social_verif_award();
  END IF;
END $$;

-- ============================================================================
-- DESCONTO DINÂMICO baseado no nível social
-- O frontend chama: SELECT * FROM social_apply_discount(p_user, 'discount_vip', amount)
-- Retorna: { applied_pct, final_amount, discount_amount }
-- ============================================================================

CREATE OR REPLACE FUNCTION public.social_apply_discount(
  p_user uuid, p_kind text, p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lvl int;
  v_pct numeric := 0;
  v_disc numeric;
  v_final numeric;
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('applied_pct',0,'final_amount',p_amount,'discount_amount',0);
  END IF;

  SELECT level INTO v_lvl FROM oculto_social_scores WHERE user_id = p_user;
  v_lvl := coalesce(v_lvl, 1);

  SELECT max(value) INTO v_pct
    FROM oculto_social_rewards
   WHERE active AND kind = p_kind AND level_min <= v_lvl;
  v_pct := coalesce(v_pct, 0);

  v_disc  := round((p_amount * v_pct / 100)::numeric, 2);
  v_final := round((p_amount - v_disc)::numeric, 2);

  RETURN jsonb_build_object(
    'applied_pct', v_pct,
    'discount_amount', v_disc,
    'final_amount', v_final,
    'level', v_lvl
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.social_apply_discount(uuid,text,numeric) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
