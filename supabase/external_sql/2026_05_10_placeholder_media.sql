-- =====================================================================
-- Placeholder Media (avatar + banner) por gênero — v2 (assets estáticos)
-- - Usa caminhos relativos (/placeholders/<gender>/<file>) servidos pelo app
-- - Adiciona flags `avatar_is_placeholder` e `cover_is_placeholder`
-- - Triggers BEFORE INSERT/UPDATE preenchem/limpam automaticamente
-- - Função backfill_placeholder_media() aplica retroativamente
-- Idempotente: pode ser re-executado.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_is_placeholder boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cover_is_placeholder boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.placeholder_media_url(
  p_user_id uuid,
  p_gender  text,
  p_kind    text  -- 'avatar' | 'banner'
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_gender_norm text;
  v_count       int;
  v_idx         int;
BEGIN
  v_gender_norm := lower(coalesce(p_gender, ''));
  v_gender_norm := CASE
    WHEN v_gender_norm IN ('homem','man','male','m') THEN 'homem'
    WHEN v_gender_norm IN ('mulher','woman','female','f') THEN 'mulher'
    WHEN v_gender_norm IN ('casal','couple','couples') THEN 'casal'
    WHEN v_gender_norm IN ('trans','travesti','transgender','trans_man','trans_woman','trav') THEN 'trans'
    ELSE 'mulher'
  END;

  v_count := 3;
  IF p_kind = 'banner' THEN v_count := 2; END IF;

  v_idx := (abs(hashtext(p_user_id::text)) % v_count) + 1;

  RETURN format(
    '/placeholders/%s/%s_%s.jpg',
    v_gender_norm,
    p_kind,
    lpad(v_idx::text, 2, '0')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fill_placeholder_media_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.is_seed, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.avatar_url IS NULL OR length(trim(NEW.avatar_url)) = 0 THEN
    NEW.avatar_url := public.placeholder_media_url(NEW.user_id, NEW.gender, 'avatar');
    NEW.avatar_is_placeholder := true;
  END IF;

  IF NEW.cover_image_url IS NULL OR length(trim(NEW.cover_image_url)) = 0 THEN
    NEW.cover_image_url := public.placeholder_media_url(NEW.user_id, NEW.gender, 'banner');
    NEW.cover_is_placeholder := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_placeholder_media_ins ON public.profiles;
CREATE TRIGGER trg_fill_placeholder_media_ins
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fill_placeholder_media_trigger();

CREATE OR REPLACE FUNCTION public.clear_placeholder_flag_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     AND NEW.avatar_url IS NOT NULL
     AND position('/placeholders/' in NEW.avatar_url) = 0 THEN
    NEW.avatar_is_placeholder := false;
  END IF;

  IF NEW.cover_image_url IS DISTINCT FROM OLD.cover_image_url
     AND NEW.cover_image_url IS NOT NULL
     AND position('/placeholders/' in NEW.cover_image_url) = 0 THEN
    NEW.cover_is_placeholder := false;
  END IF;

  IF (NEW.avatar_url IS NULL OR length(trim(NEW.avatar_url)) = 0)
     AND NOT coalesce(NEW.is_seed, false) THEN
    NEW.avatar_url := public.placeholder_media_url(NEW.user_id, NEW.gender, 'avatar');
    NEW.avatar_is_placeholder := true;
  END IF;

  IF (NEW.cover_image_url IS NULL OR length(trim(NEW.cover_image_url)) = 0)
     AND NOT coalesce(NEW.is_seed, false) THEN
    NEW.cover_image_url := public.placeholder_media_url(NEW.user_id, NEW.gender, 'banner');
    NEW.cover_is_placeholder := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_placeholder_flag_upd ON public.profiles;
CREATE TRIGGER trg_clear_placeholder_flag_upd
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.clear_placeholder_flag_trigger();

CREATE OR REPLACE FUNCTION public.backfill_placeholder_media()
RETURNS TABLE(updated_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  WITH upd AS (
    UPDATE public.profiles p
       SET avatar_url = CASE
             WHEN (p.avatar_url IS NULL OR length(trim(p.avatar_url)) = 0
                   OR p.avatar_url LIKE 'https://bpmeahyvubewqmmdxsll.supabase.co/storage/v1/object/public/avatars/_placeholders/%')
               THEN public.placeholder_media_url(p.user_id, p.gender, 'avatar')
             ELSE p.avatar_url
           END,
           avatar_is_placeholder = CASE
             WHEN (p.avatar_url IS NULL OR length(trim(p.avatar_url)) = 0
                   OR p.avatar_url LIKE '%/_placeholders/%'
                   OR p.avatar_url LIKE '/placeholders/%') THEN true
             ELSE p.avatar_is_placeholder
           END,
           cover_image_url = CASE
             WHEN (p.cover_image_url IS NULL OR length(trim(p.cover_image_url)) = 0
                   OR p.cover_image_url LIKE 'https://bpmeahyvubewqmmdxsll.supabase.co/storage/v1/object/public/avatars/_placeholders/%')
               THEN public.placeholder_media_url(p.user_id, p.gender, 'banner')
             ELSE p.cover_image_url
           END,
           cover_is_placeholder = CASE
             WHEN (p.cover_image_url IS NULL OR length(trim(p.cover_image_url)) = 0
                   OR p.cover_image_url LIKE '%/_placeholders/%'
                   OR p.cover_image_url LIKE '/placeholders/%') THEN true
             ELSE p.cover_is_placeholder
           END
     WHERE coalesce(p.is_seed, false) = false
       AND (
            p.avatar_url IS NULL OR length(trim(p.avatar_url)) = 0
         OR p.cover_image_url IS NULL OR length(trim(p.cover_image_url)) = 0
         OR p.avatar_url LIKE '%/_placeholders/%'
         OR p.cover_image_url LIKE '%/_placeholders/%'
       )
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  updated_count := v_count;
  RETURN NEXT;
END;
$$;

SELECT * FROM public.backfill_placeholder_media();
