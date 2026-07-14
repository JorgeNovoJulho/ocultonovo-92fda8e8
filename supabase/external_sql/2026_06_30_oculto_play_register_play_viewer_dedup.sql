-- ============================================================
-- Oculto Play — dedup de visualização por viewer_key anônimo
-- Cria nova assinatura do RPC oculto_play_register_play aceitando
-- um identificador opaco do "viewer" (persistido em localStorage no
-- cliente) e deduplica visualizações por (item, viewer) em janela
-- de 30 minutos.
--
-- Idempotente: pode ser executado várias vezes.
-- ============================================================

-- 1) Tabela de visualizações deduplicadas por viewer_key
CREATE TABLE IF NOT EXISTS public.oculto_play_view_dedup (
  item_id     uuid        NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  viewer_key  text        NOT NULL,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, viewer_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_view_dedup TO authenticated;
GRANT ALL ON public.oculto_play_view_dedup TO service_role;

ALTER TABLE public.oculto_play_view_dedup ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'oculto_play_view_dedup'
       AND policyname = 'oculto_play_view_dedup_no_direct_access'
  ) THEN
    -- Acesso direto bloqueado; a manipulação ocorre via SECURITY DEFINER.
    CREATE POLICY oculto_play_view_dedup_no_direct_access
      ON public.oculto_play_view_dedup
      FOR ALL
      TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS oculto_play_view_dedup_last_seen_idx
  ON public.oculto_play_view_dedup (last_seen);

-- 2) Nova assinatura do RPC com viewer_key
CREATE OR REPLACE FUNCTION public.oculto_play_register_play(
  p_item_id    uuid,
  p_viewer_key text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count    int;
  v_window   interval := interval '30 minutes';
  v_now      timestamptz := now();
  v_existing timestamptz;
BEGIN
  IF p_item_id IS NULL THEN RETURN 0; END IF;
  IF NOT public.can_access_oculto_play() THEN RETURN 0; END IF;

  -- Sem viewer_key: cai no comportamento antigo (apenas incrementa).
  IF p_viewer_key IS NULL OR length(btrim(p_viewer_key)) = 0 THEN
    UPDATE public.oculto_play_items
       SET view_count = COALESCE(view_count, 0) + 1
     WHERE id = p_item_id
    RETURNING view_count INTO v_count;
    RETURN COALESCE(v_count, 0);
  END IF;

  -- Dedup: se o mesmo viewer já contabilizou nos últimos 30 min,
  -- retorna a contagem atual sem somar de novo.
  SELECT last_seen INTO v_existing
    FROM public.oculto_play_view_dedup
   WHERE item_id = p_item_id
     AND viewer_key = p_viewer_key
   FOR UPDATE;

  IF v_existing IS NOT NULL AND v_now - v_existing < v_window THEN
    SELECT view_count INTO v_count
      FROM public.oculto_play_items
     WHERE id = p_item_id;
    RETURN COALESCE(v_count, 0);
  END IF;

  INSERT INTO public.oculto_play_view_dedup (item_id, viewer_key, last_seen)
       VALUES (p_item_id, p_viewer_key, v_now)
  ON CONFLICT (item_id, viewer_key)
    DO UPDATE SET last_seen = EXCLUDED.last_seen;

  UPDATE public.oculto_play_items
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = p_item_id
  RETURNING view_count INTO v_count;

  RETURN COALESCE(v_count, 0);
END
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_register_play(uuid, text) TO authenticated;

-- 3) Mantém a assinatura antiga delegando para a nova (compatibilidade).
CREATE OR REPLACE FUNCTION public.oculto_play_register_play(p_item_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.oculto_play_register_play(p_item_id, NULL::text);
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_register_play(uuid) TO authenticated;
