-- =====================================================================
-- 2026-06-02 — RPC aura_gifts_global_ranking (v4, gift_history opcional)
-- Corrige o erro "relation public.gift_history does not exist" detectando
-- a tabela em tempo de execução. Caso não exista, conta apenas o XP do
-- oculto_aura_xp_gifts. A CONTAGEM canônica vem de
-- profiles.gifts_received_count em ambos os casos.
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

DROP FUNCTION IF EXISTS public.aura_gifts_global_ranking(integer);

CREATE OR REPLACE FUNCTION public.aura_gifts_global_ranking(p_limit integer DEFAULT 20)
RETURNS TABLE (
  profile_id     uuid,
  user_id        uuid,
  username       text,
  name           text,
  avatar_url     text,
  profile_type   text,
  address_city   text,
  address_state  text,
  total_xp       bigint,
  gifts_count    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_chat boolean := to_regclass('public.gift_history') IS NOT NULL;
  sql      text;
BEGIN
  sql := $Q$
    WITH aura AS (
      SELECT receiver_id, COALESCE(amount,0)::bigint AS amount
        FROM public.oculto_aura_xp_gifts
    )
  $Q$;

  IF has_chat THEN
    sql := sql || $Q$,
      chat AS (
        SELECT receiver_id, COALESCE(amount,0)::bigint AS amount
          FROM public.gift_history
         WHERE is_visible IS DISTINCT FROM false
      ),
      raw_all AS (SELECT * FROM aura UNION ALL SELECT * FROM chat)
    $Q$;
  ELSE
    sql := sql || $Q$,
      raw_all AS (SELECT * FROM aura)
    $Q$;
  END IF;

  sql := sql || $Q$,
    resolved AS (
      SELECT COALESCE(p.id, r.receiver_id) AS canonical_id, r.amount
        FROM raw_all r
        LEFT JOIN public.profiles p
          ON p.id = r.receiver_id OR p.user_id = r.receiver_id
    ),
    xp_agg AS (
      SELECT canonical_id, SUM(amount)::bigint AS total_xp
        FROM resolved GROUP BY canonical_id
    ),
    base AS (
      SELECT
        p.id AS profile_id, p.user_id, p.username, p.name, p.avatar_url,
        p.profile_type, p.address_city, p.address_state,
        COALESCE(p.gifts_received_count, 0)::bigint AS gifts_count,
        COALESCE(x.total_xp, 0)::bigint             AS total_xp
      FROM public.profiles p
      LEFT JOIN xp_agg x ON x.canonical_id = p.id
      WHERE COALESCE(p.is_seed, false) = false
        AND (COALESCE(p.gifts_received_count, 0) > 0 OR COALESCE(x.total_xp, 0) > 0)
    )
    SELECT profile_id, user_id, username, name, avatar_url,
           profile_type, address_city, address_state, total_xp, gifts_count
      FROM base
     ORDER BY gifts_count DESC, total_xp DESC, profile_id ASC
     LIMIT GREATEST(COALESCE($1, 20), 1);
  $Q$;

  RETURN QUERY EXECUTE sql USING p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.aura_gifts_global_ranking(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.aura_gifts_global_ranking(integer)
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- Modo de visualização PERSONALIZADO (toggles por widget, em tempo real)
-- ─────────────────────────────────────────────────────────────────────

-- 1) Persistência dos toggles por usuário (mapa widget_key → boolean)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_widgets_custom jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Registra o modo na config admin para aparecer no seletor
INSERT INTO public.oculto_feed_modes_config
  (mode_id, label, description, enabled, min_plan, sort_order)
VALUES
  ('personalizado','Personalizado','Você escolhe quais blocos do feed aparecem',true,'free',60)
ON CONFLICT (mode_id) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      enabled = EXCLUDED.enabled,
      min_plan = EXCLUDED.min_plan,
      sort_order = EXCLUDED.sort_order;

-- 3) RPC para salvar os toggles (mesma convenção do set_feed_mode)
CREATE OR REPLACE FUNCTION public.set_feed_widgets_custom(p_widgets jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  UPDATE public.profiles
     SET feed_widgets_custom = COALESCE(p_widgets, '{}'::jsonb)
   WHERE id = auth.uid() OR user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_feed_widgets_custom(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.set_feed_widgets_custom(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
