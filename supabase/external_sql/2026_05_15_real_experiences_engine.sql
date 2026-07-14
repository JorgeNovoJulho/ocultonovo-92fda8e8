-- =====================================================================
-- PRIORIDADE 3 — Experiências Sociais Reais (extensão segura, idempotente)
-- Estende oculto_real_experiences (criada na Onda C) com:
--   regras de elegibilidade, região aproximada, moderação master,
--   participants ricos (pending/approved/rejected/checked_in/blocked),
--   RPCs de criação/inscrição/moderação/check-in/listagem admin.
-- Privacidade: nunca expor lat/lng exatos; somente região aproximada.
-- =====================================================================

-- 1) Extensão de colunas (safe / idempotente) ---------------------------
ALTER TABLE public.oculto_real_experiences
  ADD COLUMN IF NOT EXISTS approximate_region text,
  ADD COLUMN IF NOT EXISTS max_participants   int,
  ADD COLUMN IF NOT EXISTS visibility         text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS min_social_score   int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_trust_score    int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_aura_level     int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_required  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rejection_reason   text,
  ADD COLUMN IF NOT EXISTS moderated_by       uuid,
  ADD COLUMN IF NOT EXISTS moderated_at       timestamptz;

-- visibility válida
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'real_exp_visibility_chk'
  ) THEN
    ALTER TABLE public.oculto_real_experiences
      ADD CONSTRAINT real_exp_visibility_chk
      CHECK (visibility IN ('public','vip','invite_only','private'));
  END IF;
END$$;

-- 2) Participants (substitui rsvp simples mantendo compat) --------------
CREATE TABLE IF NOT EXISTS public.oculto_real_experience_participants (
  experience_id uuid NOT NULL REFERENCES public.oculto_real_experiences(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','checked_in','blocked','cancelled')),
  consent_at    timestamptz NOT NULL DEFAULT now(),
  decided_by    uuid,
  decided_at    timestamptz,
  checked_in_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experience_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_real_exp_part_user   ON public.oculto_real_experience_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_real_exp_part_status ON public.oculto_real_experience_participants(experience_id, status);

ALTER TABLE public.oculto_real_experience_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rep read self or host" ON public.oculto_real_experience_participants;
CREATE POLICY "rep read self or host" ON public.oculto_real_experience_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.oculto_real_experiences e
      WHERE e.id = experience_id AND e.host_user = auth.uid()
    )
  );

-- inserts/updates passam por RPCs — sem policy direta de write.

-- 3) Helper interno: master admin ---------------------------------------
CREATE OR REPLACE FUNCTION public._real_exp_is_master(_uid uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean := false;
BEGIN
  BEGIN SELECT public.has_role(_uid, 'master_admin') INTO v;
  EXCEPTION WHEN OTHERS THEN
    BEGIN SELECT COALESCE(is_master,false) INTO v FROM public.profiles WHERE id = _uid;
    EXCEPTION WHEN OTHERS THEN v := false; END;
  END;
  RETURN COALESCE(v,false);
END$$;
GRANT EXECUTE ON FUNCTION public._real_exp_is_master(uuid) TO authenticated;

-- 4) Helper: identidade social do usuário (score/trust/aura/kyc) --------
CREATE OR REPLACE FUNCTION public._real_exp_eligibility(_uid uuid)
RETURNS TABLE(score int, trust int, aura int, kyc boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT (s->>'score')::int  FROM (
              SELECT public.social_core_identity_get(_uid) AS s) x), 0)         AS score,
    COALESCE((SELECT (s->>'trust')::int  FROM (
              SELECT public.social_core_identity_get(_uid) AS s) x), 0)         AS trust,
    COALESCE((SELECT (s->>'aura_level')::int FROM (
              SELECT public.social_core_identity_get(_uid) AS s) x), 0)         AS aura,
    COALESCE((SELECT document_verified FROM public.profiles WHERE id=_uid), false) AS kyc;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 0, 0, 0, false;
END$$;
GRANT EXECUTE ON FUNCTION public._real_exp_eligibility(uuid) TO authenticated;

-- 5) Criar experiência (status=pending_moderation) ----------------------
CREATE OR REPLACE FUNCTION public.real_experience_create(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_kyc boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  -- exige KYC do host por padrão (segurança)
  SELECT COALESCE(document_verified,false) INTO v_kyc FROM public.profiles WHERE id = v_uid;
  IF NOT v_kyc THEN RAISE EXCEPTION 'host kyc required'; END IF;

  INSERT INTO public.oculto_real_experiences(
    host_user, kind, title, description,
    city, state, approximate_region,
    starts_at, ends_at,
    capacity, max_participants,
    vip_only, requires_kyc,
    visibility, approval_required,
    min_social_score, min_trust_score, min_aura_level,
    status
  ) VALUES (
    v_uid,
    COALESCE(p_payload->>'kind','encontro'),
    COALESCE(p_payload->>'title','Experiência'),
    p_payload->>'description',
    p_payload->>'city',
    p_payload->>'state',
    p_payload->>'approximate_region',
    COALESCE((p_payload->>'starts_at')::timestamptz, now() + interval '1 day'),
    NULLIF(p_payload->>'ends_at','')::timestamptz,
    COALESCE((p_payload->>'capacity')::int, 20),
    NULLIF(p_payload->>'max_participants','')::int,
    COALESCE((p_payload->>'vip_only')::boolean, false),
    COALESCE((p_payload->>'requires_kyc')::boolean, true),
    COALESCE(p_payload->>'visibility','public'),
    COALESCE((p_payload->>'approval_required')::boolean, true),
    COALESCE((p_payload->>'min_social_score')::int, 0),
    COALESCE((p_payload->>'min_trust_score')::int, 0),
    COALESCE((p_payload->>'min_aura_level')::int, 0),
    'pending_moderation'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END$$;
GRANT EXECUTE ON FUNCTION public.real_experience_create(jsonb) TO authenticated;

-- 6) Solicitar participação ---------------------------------------------
CREATE OR REPLACE FUNCTION public.real_experience_request_join(p_experience uuid, p_consent boolean)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_e      public.oculto_real_experiences;
  v_score  int; v_trust int; v_aura int; v_kyc boolean;
  v_count  int;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT p_consent THEN RAISE EXCEPTION 'consent required'; END IF;

  SELECT * INTO v_e FROM public.oculto_real_experiences WHERE id = p_experience;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF v_e.status <> 'approved' THEN RAISE EXCEPTION 'experience not approved'; END IF;
  IF v_e.starts_at <= now() THEN RAISE EXCEPTION 'experience already started'; END IF;

  -- bloqueio mútuo
  IF EXISTS (
    SELECT 1 FROM public.blocked_contacts
    WHERE (blocker_id = v_e.host_user AND blocked_id = v_uid)
       OR (blocker_id = v_uid AND blocked_id = v_e.host_user)
  ) THEN
    RAISE EXCEPTION 'blocked';
  END IF;

  -- elegibilidade
  SELECT score, trust, aura, kyc INTO v_score, v_trust, v_aura, v_kyc
    FROM public._real_exp_eligibility(v_uid);
  IF v_e.requires_kyc AND NOT v_kyc THEN RAISE EXCEPTION 'kyc required'; END IF;
  IF v_score < v_e.min_social_score THEN RAISE EXCEPTION 'social score too low'; END IF;
  IF v_trust < v_e.min_trust_score  THEN RAISE EXCEPTION 'trust score too low';  END IF;
  IF v_aura  < v_e.min_aura_level   THEN RAISE EXCEPTION 'aura level too low';   END IF;

  -- capacidade
  SELECT count(*) INTO v_count
    FROM public.oculto_real_experience_participants
    WHERE experience_id = p_experience AND status IN ('approved','checked_in');
  IF v_count >= COALESCE(v_e.max_participants, v_e.capacity) THEN
    RAISE EXCEPTION 'capacity reached';
  END IF;

  v_status := CASE WHEN v_e.approval_required THEN 'pending' ELSE 'approved' END;

  INSERT INTO public.oculto_real_experience_participants(experience_id, user_id, status, consent_at)
  VALUES (p_experience, v_uid, v_status, now())
  ON CONFLICT (experience_id, user_id) DO UPDATE
    SET status = EXCLUDED.status, consent_at = EXCLUDED.consent_at;

  RETURN v_status;
END$$;
GRANT EXECUTE ON FUNCTION public.real_experience_request_join(uuid, boolean) TO authenticated;

-- 7) Decisão sobre participante (host ou admin) -------------------------
CREATE OR REPLACE FUNCTION public.real_experience_participant_decide(
  p_experience uuid, p_user uuid, p_decision text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_host uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_decision NOT IN ('approved','rejected','blocked') THEN
    RAISE EXCEPTION 'invalid decision';
  END IF;

  SELECT host_user INTO v_host FROM public.oculto_real_experiences WHERE id = p_experience;
  IF v_host IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF v_host <> v_uid AND NOT public._real_exp_is_master(v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.oculto_real_experience_participants
     SET status = p_decision, decided_by = v_uid, decided_at = now()
   WHERE experience_id = p_experience AND user_id = p_user;
END$$;
GRANT EXECUTE ON FUNCTION public.real_experience_participant_decide(uuid, uuid, text) TO authenticated;

-- 8) Check-in seguro do participante ------------------------------------
CREATE OR REPLACE FUNCTION public.real_experience_checkin(p_experience uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.oculto_real_experience_participants
     SET status = 'checked_in', checked_in_at = now()
   WHERE experience_id = p_experience AND user_id = v_uid AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'not approved'; END IF;
END$$;
GRANT EXECUTE ON FUNCTION public.real_experience_checkin(uuid) TO authenticated;

-- 9) Moderação master (aprovar/rejeitar/cancelar experiência) -----------
CREATE OR REPLACE FUNCTION public.real_experience_moderate(
  p_experience uuid, p_decision text, p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public._real_exp_is_master(v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_decision NOT IN ('approved','rejected','cancelled','closed') THEN
    RAISE EXCEPTION 'invalid decision';
  END IF;

  UPDATE public.oculto_real_experiences
     SET status = p_decision,
         rejection_reason = CASE WHEN p_decision='rejected' THEN p_reason ELSE rejection_reason END,
         moderated_by = v_uid, moderated_at = now()
   WHERE id = p_experience;
END$$;
GRANT EXECUTE ON FUNCTION public.real_experience_moderate(uuid, text, text) TO authenticated;

-- 10) Listagem admin master ---------------------------------------------
CREATE OR REPLACE FUNCTION public.real_experience_admin_list(
  p_status text DEFAULT NULL, p_limit int DEFAULT 50
) RETURNS TABLE(
  id uuid, host_user uuid, kind text, title text, description text,
  city text, state text, approximate_region text,
  starts_at timestamptz, ends_at timestamptz,
  capacity int, max_participants int, vip_only boolean, requires_kyc boolean,
  visibility text, approval_required boolean,
  min_social_score int, min_trust_score int, min_aura_level int,
  status text, rejection_reason text, created_at timestamptz,
  going_count int, pending_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._real_exp_is_master(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT
    e.id, e.host_user, e.kind, e.title, e.description,
    e.city, e.state, e.approximate_region,
    e.starts_at, e.ends_at, e.capacity, e.max_participants,
    e.vip_only, e.requires_kyc, e.visibility, e.approval_required,
    e.min_social_score, e.min_trust_score, e.min_aura_level,
    e.status, e.rejection_reason, e.created_at,
    (SELECT count(*)::int FROM public.oculto_real_experience_participants p
       WHERE p.experience_id = e.id AND p.status IN ('approved','checked_in')) AS going_count,
    (SELECT count(*)::int FROM public.oculto_real_experience_participants p
       WHERE p.experience_id = e.id AND p.status = 'pending') AS pending_count
  FROM public.oculto_real_experiences e
  WHERE (p_status IS NULL OR e.status = p_status)
  ORDER BY e.created_at DESC
  LIMIT GREATEST(1, LEAST(200, p_limit));
END$$;
GRANT EXECUTE ON FUNCTION public.real_experience_admin_list(text, int) TO authenticated;

-- 11) Atualizar RPC público para retornar approximate_region (nunca lat/lng)
CREATE OR REPLACE FUNCTION public.real_experiences_upcoming(p_limit int DEFAULT 20)
RETURNS TABLE(
  id uuid, kind text, title text, description text,
  city text, state text, approximate_region text,
  starts_at timestamptz, ends_at timestamptz,
  capacity int, vip_only boolean, requires_kyc boolean,
  host_user uuid, going_count int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.kind, e.title, e.description,
         e.city, e.state, e.approximate_region,
         e.starts_at, e.ends_at, e.capacity, e.vip_only, e.requires_kyc,
         e.host_user,
         (SELECT count(*)::int FROM public.oculto_real_experience_participants r
           WHERE r.experience_id = e.id AND r.status IN ('approved','checked_in')) AS going_count
  FROM public.oculto_real_experiences e
  WHERE e.status = 'approved' AND e.starts_at > now()
    AND e.visibility IN ('public','vip')
  ORDER BY e.starts_at ASC
  LIMIT GREATEST(1, LEAST(50, p_limit));
$$;
GRANT EXECUTE ON FUNCTION public.real_experiences_upcoming(int) TO authenticated;
