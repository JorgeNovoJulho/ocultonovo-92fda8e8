-- ============================================================================
-- 2026-06-07 — Regeneração de link de indicação preservando links antigos
-- Cole no SQL Editor do Supabase EXTERNO. 100% idempotente.
--
-- O QUE FAZ:
--   1) Garante coluna profiles.creator_referral_code (text) — código ATIVO.
--   2) Cria oculto_referral_aliases: histórico de TODOS os códigos que cada
--      perfil já teve. Links antigos resolvem por aqui para sempre.
--   3) Reescreve lookup_referral_code: primeiro tenta o alias, depois o
--      código ativo, depois username, depois UUID.
--   4) RPC regenerate_creator_referral_code():
--        - guarda o código atual como alias (is_active=false)
--        - gera novo: {USERNAME}_{4 chars aleatórios em base36}
--        - registra novo como alias ativo
--        - atualiza profiles.creator_referral_code
--        - retorna o novo código
-- ============================================================================

-- 1) Coluna do código ATIVO em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creator_referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_creator_referral_code_unique
  ON public.profiles (upper(creator_referral_code))
  WHERE creator_referral_code IS NOT NULL;

-- 2) Histórico de aliases (todo código que já existiu)
CREATE TABLE IF NOT EXISTS public.oculto_referral_aliases (
  code              text PRIMARY KEY,
  owner_profile_id  uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  source            text NOT NULL DEFAULT 'manual', -- 'username' | 'regenerate' | 'manual'
  created_at        timestamptz NOT NULL DEFAULT now(),
  retired_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_oculto_referral_aliases_owner
  ON public.oculto_referral_aliases (owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_oculto_referral_aliases_active
  ON public.oculto_referral_aliases (owner_profile_id) WHERE is_active = true;

GRANT SELECT ON public.oculto_referral_aliases TO anon, authenticated;
GRANT ALL ON public.oculto_referral_aliases TO service_role;

ALTER TABLE public.oculto_referral_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aliases_select_public" ON public.oculto_referral_aliases;
CREATE POLICY "aliases_select_public"
  ON public.oculto_referral_aliases FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "aliases_owner_or_master_write" ON public.oculto_referral_aliases;
CREATE POLICY "aliases_owner_or_master_write"
  ON public.oculto_referral_aliases FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = owner_profile_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = owner_profile_id AND p.user_id = auth.uid())
  );

-- 3) Normalizador igual ao do frontend (inviteLinks.ts)
CREATE OR REPLACE FUNCTION public._normalize_referral_code(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
  v := COALESCE(p_value, '');
  v := regexp_replace(v, '^@+', '');
  v := regexp_replace(v, '[^a-zA-Z0-9_]+', '_', 'g');
  v := regexp_replace(v, '_+', '_', 'g');
  v := regexp_replace(v, '^_+|_+$', '', 'g');
  IF v = '' THEN RETURN NULL; END IF;
  RETURN upper(v);
END $$;

-- 4) Lookup definitivo — consulta aliases primeiro, depois fallbacks.
CREATE OR REPLACE FUNCTION public.lookup_referral_code(p_code text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code  text := btrim(coalesce(p_code, ''));
  v_lower text := lower(v_code);
  v_norm  text := public._normalize_referral_code(v_code);
  v_uuid  uuid;
  v_row   record;
BEGIN
  IF v_code = '' THEN RETURN NULL; END IF;

  BEGIN v_uuid := v_code::uuid; EXCEPTION WHEN others THEN v_uuid := NULL; END;

  -- (A) Alias — fonte canônica. Inclui códigos retirados.
  SELECT p.id, p.user_id, p.username, p.name, p.avatar_url,
         p.is_verified, p.bio, p.is_creator, p.creator_referral_code
    INTO v_row
    FROM public.oculto_referral_aliases a
    JOIN public.profiles p ON p.id = a.owner_profile_id
   WHERE upper(a.code) = v_norm
   LIMIT 1;

  -- (B) Código ativo direto em profiles
  IF v_row IS NULL THEN
    SELECT p.id, p.user_id, p.username, p.name, p.avatar_url,
           p.is_verified, p.bio, p.is_creator, p.creator_referral_code
      INTO v_row
      FROM public.profiles p
     WHERE upper(coalesce(p.creator_referral_code, '')) = v_norm
     LIMIT 1;
  END IF;

  -- (C) Username
  IF v_row IS NULL THEN
    SELECT p.id, p.user_id, p.username, p.name, p.avatar_url,
           p.is_verified, p.bio, p.is_creator, p.creator_referral_code
      INTO v_row
      FROM public.profiles p
     WHERE lower(coalesce(p.username, '')) = v_lower
     LIMIT 1;
  END IF;

  -- (D) UUID
  IF v_row IS NULL AND v_uuid IS NOT NULL THEN
    SELECT p.id, p.user_id, p.username, p.name, p.avatar_url,
           p.is_verified, p.bio, p.is_creator, p.creator_referral_code
      INTO v_row
      FROM public.profiles p
     WHERE p.id = v_uuid OR p.user_id = v_uuid
     LIMIT 1;
  END IF;

  IF v_row IS NULL THEN RETURN NULL; END IF;

  RETURN json_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'username', v_row.username,
    'name', v_row.name,
    'avatar_url', v_row.avatar_url,
    'is_verified', coalesce(v_row.is_verified, false),
    'bio', v_row.bio,
    'is_creator', coalesce(v_row.is_creator, true),
    'creator_referral_code', v_row.creator_referral_code
  );
END $$;

REVOKE ALL ON FUNCTION public.lookup_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_referral_code(text) TO anon, authenticated, service_role;

-- 5) RPC de regeneração — usado pelo botão.
CREATE OR REPLACE FUNCTION public.regenerate_creator_referral_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_username text;
  v_current text;
  v_base text;
  v_new text;
  v_try int := 0;
  v_suffix text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT id, username, creator_referral_code
    INTO v_profile_id, v_username, v_current
    FROM public.profiles
   WHERE user_id = v_uid
   LIMIT 1;

  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  v_base := public._normalize_referral_code(coalesce(v_username, v_profile_id::text));
  IF v_base IS NULL THEN RAISE EXCEPTION 'cannot derive base code'; END IF;

  -- Aposenta código atual (se houver) como alias.
  IF v_current IS NOT NULL THEN
    INSERT INTO public.oculto_referral_aliases (code, owner_profile_id, is_active, source, retired_at)
    VALUES (public._normalize_referral_code(v_current), v_profile_id, false, 'regenerate', now())
    ON CONFLICT (code) DO UPDATE
      SET is_active = false,
          retired_at = now();
  END IF;

  -- Garante que o username "puro" também vire alias permanente (pra links antigos sem sufixo).
  INSERT INTO public.oculto_referral_aliases (code, owner_profile_id, is_active, source)
  VALUES (v_base, v_profile_id, false, 'username')
  ON CONFLICT (code) DO NOTHING;

  -- Gera novo código único: BASE_XXXX (4 chars base36)
  LOOP
    v_try := v_try + 1;
    v_suffix := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    v_new := v_base || '_' || v_suffix;

    IF NOT EXISTS (SELECT 1 FROM public.oculto_referral_aliases WHERE code = v_new)
       AND NOT EXISTS (SELECT 1 FROM public.profiles
                        WHERE upper(creator_referral_code) = v_new
                          AND id <> v_profile_id) THEN
      EXIT;
    END IF;
    IF v_try > 20 THEN RAISE EXCEPTION 'unable to generate unique code'; END IF;
  END LOOP;

  -- Registra novo alias ativo
  INSERT INTO public.oculto_referral_aliases (code, owner_profile_id, is_active, source)
  VALUES (v_new, v_profile_id, true, 'regenerate');

  -- Atualiza código ativo no profile
  UPDATE public.profiles
     SET creator_referral_code = v_new,
         updated_at = now()
   WHERE id = v_profile_id;

  RETURN v_new;
END $$;

GRANT EXECUTE ON FUNCTION public.regenerate_creator_referral_code() TO authenticated;

-- 6) Backfill: registra username atual de cada perfil como alias inativo
--    para garantir que links já enviados continuem funcionando.
INSERT INTO public.oculto_referral_aliases (code, owner_profile_id, is_active, source)
SELECT public._normalize_referral_code(p.username), p.id, false, 'username'
  FROM public.profiles p
 WHERE p.username IS NOT NULL
   AND public._normalize_referral_code(p.username) IS NOT NULL
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.oculto_referral_aliases (code, owner_profile_id, is_active, source)
SELECT public._normalize_referral_code(p.creator_referral_code), p.id, true, 'manual'
  FROM public.profiles p
 WHERE p.creator_referral_code IS NOT NULL
   AND public._normalize_referral_code(p.creator_referral_code) IS NOT NULL
ON CONFLICT (code) DO UPDATE SET is_active = true;

NOTIFY pgrst, 'reload schema';
