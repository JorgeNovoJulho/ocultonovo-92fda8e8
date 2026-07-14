-- ============================================================================
-- FIX: trigger _trg_social_follow_award referenciava NEW.followed_id de forma
-- estática. Em plpgsql, qualquer NEW.<campo> é resolvido no parse, então mesmo
-- dentro de COALESCE quebra com:
--   record "new" has no field "followed_id"
-- Solução: ler campos via to_jsonb(NEW) (acesso dinâmico, sem parse error).
-- Cole no SQL Editor do Supabase EXTERNO.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._trg_social_follow_award()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j jsonb := to_jsonb(NEW);
  v_target uuid;
BEGIN
  v_target := COALESCE(
    NULLIF(j->>'following_id','')::uuid,
    NULLIF(j->>'followed_id','')::uuid,
    NULLIF(j->>'target_id','')::uuid,
    NULLIF(j->>'followee_id','')::uuid
  );

  IF v_target IS NOT NULL THEN
    BEGIN
      PERFORM public.social_score_award(
        public._social_resolve_uid(v_target),
        'follower_gained',
        (j->>'id')
      );
    EXCEPTION WHEN OTHERS THEN
      -- nunca quebrar o INSERT do follow por causa de scoring
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
