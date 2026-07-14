-- ============================================================================
-- Filtro Global de Gênero do Feed — coluna canônica `gender_category`
-- Idempotente. Roda no Supabase EXTERNO (SQL Editor).
--
-- Cria/atualiza:
--   - public.profiles.gender_category  text  (homem|mulher|casal|lgbtqia|NULL)
--   - função compute_gender_category(text) — normaliza gênero bruto
--   - trigger BEFORE INSERT/UPDATE OF gender — mantém categoria em sincronia
--   - backfill de todas as linhas existentes
--   - índice para filtragem rápida no feed
--
-- Espelha exatamente classifyGender() de src/config/feedGenderFilter.ts.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender_category text;

CREATE OR REPLACE FUNCTION public.compute_gender_category(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  g text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;

  g := lower(raw);
  -- Remove acentos comuns (pt-BR) e espaços
  g := translate(
    g,
    'áàâãäéèêëíìïîóòôõöúùûüç',
    'aaaaaeeeeiiiioooooouuuuc'
  );
  g := regexp_replace(g, '\s+', ' ', 'g');
  g := btrim(g);

  IF g = '' THEN RETURN NULL; END IF;

  -- LGBTQIA+ tem precedência (ex.: "casal_ele_ele" não é casal hetero)
  IF g ~ '(gay|lesbic|lesbian|trans|travesti|crossdres|drag|nao.?binar|non.?binary|queer|casal.?ele.?ele|casal.?ela.?ela|homem.?trans|mulher.?trans)'
  THEN
    RETURN 'lgbtqia';
  END IF;

  -- Homem
  IF g IN ('homem','male','man','m','masculino','h')
     OR g LIKE 'homem %' OR g LIKE 'homem-%' OR g LIKE 'homem_%'
  THEN
    RETURN 'homem';
  END IF;

  -- Mulher
  IF g IN ('mulher','female','woman','f','feminino','w')
     OR g LIKE 'mulher %' OR g LIKE 'mulher-%' OR g LIKE 'mulher_%'
  THEN
    RETURN 'mulher';
  END IF;

  -- Casal hetero (Ele/Ela)
  IF g LIKE 'casal%' OR g LIKE 'couple%' THEN
    -- Já tratamos casal_ele_ele/casal_ela_ela acima como LGBTQIA+
    RETURN 'casal';
  END IF;

  -- Qualquer outro valor preenchido → LGBTQIA+ (outros)
  RETURN 'lgbtqia';
END;
$$;

CREATE OR REPLACE FUNCTION public.profiles_set_gender_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.gender_category := public.compute_gender_category(NEW.gender);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_set_gender_category ON public.profiles;
CREATE TRIGGER trg_profiles_set_gender_category
BEFORE INSERT OR UPDATE OF gender ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_set_gender_category();

-- Backfill: recalcula tudo (idempotente)
UPDATE public.profiles
   SET gender_category = public.compute_gender_category(gender)
 WHERE gender_category IS DISTINCT FROM public.compute_gender_category(gender);

CREATE INDEX IF NOT EXISTS idx_profiles_gender_category
  ON public.profiles (gender_category);

COMMENT ON COLUMN public.profiles.gender_category IS
  'Categoria canônica derivada de profiles.gender. Valores: homem|mulher|casal|lgbtqia|NULL. Mantida por trigger.';
