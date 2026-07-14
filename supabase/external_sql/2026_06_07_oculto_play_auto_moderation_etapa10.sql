-- ============================================================================
-- OCULTO PLAY — Etapa 10: Moderação Proativa (auto-ocultação por volume)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. Acrescenta colunas, 1 trigger e 2 RPCs Master.
-- ----------------------------------------------------------------------------
-- O que faz:
--   1) Adiciona em oculto_play_items:
--        - auto_hidden_at      timestamptz
--        - auto_hidden_reason  text
--        - auto_hidden_count   int (snapshot do nº de denúncias no momento)
--   2) Trigger oculto_play_auto_hide_on_report (AFTER INSERT em reports):
--        Se denúncias PENDENTES do item >= threshold (padrão 5) e o item
--        ainda está publicado, despublica automaticamente e preenche
--        auto_hidden_*. Não apaga nada. Master pode restaurar.
--   3) RPC oculto_play_auto_hidden_list()  → lista para painel Master.
--   4) RPC oculto_play_auto_hidden_decide(p_item_id, p_action)
--        Ações:
--          'restore'      → republica + limpa marcas auto_hidden_*
--          'keep_hidden'  → mantém oculto, resolve denúncias pendentes como 'removed'
--          'purge'        → apaga item (denúncias caem em cascata se houver)
-- ============================================================================

-- 1) Colunas (idempotente) ---------------------------------------------------
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS auto_hidden_at     timestamptz,
  ADD COLUMN IF NOT EXISTS auto_hidden_reason text,
  ADD COLUMN IF NOT EXISTS auto_hidden_count  int;

CREATE INDEX IF NOT EXISTS idx_oculto_play_items_auto_hidden
  ON public.oculto_play_items (auto_hidden_at DESC)
  WHERE auto_hidden_at IS NOT NULL;

-- 2) Trigger de auto-ocultação ----------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_auto_hide_on_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold int := 5; -- ajuste se quiser; mantém conservador
  v_pending   int;
  v_item      record;
BEGIN
  SELECT * INTO v_item FROM public.oculto_play_items WHERE id = NEW.item_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_item.is_published = false THEN RETURN NEW; END IF;
  IF v_item.auto_hidden_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_pending
    FROM public.oculto_play_reports
   WHERE item_id = NEW.item_id AND status = 'pending';

  IF v_pending >= v_threshold THEN
    UPDATE public.oculto_play_items
       SET is_published      = false,
           auto_hidden_at    = now(),
           auto_hidden_reason= 'volume_de_denuncias',
           auto_hidden_count = v_pending
     WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_play_auto_hide ON public.oculto_play_reports;
CREATE TRIGGER trg_oculto_play_auto_hide
AFTER INSERT ON public.oculto_play_reports
FOR EACH ROW
EXECUTE FUNCTION public.oculto_play_auto_hide_on_report();

-- 3) Lista de itens auto-ocultos (Master) ------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_auto_hidden_list(p_limit int DEFAULT 50)
RETURNS TABLE (
  item_id           uuid,
  kind              text,
  title             text,
  caption           text,
  thumb_url         text,
  media_url         text,
  visibility        text,
  is_published      boolean,
  report_count      int,
  auto_hidden_at    timestamptz,
  auto_hidden_reason text,
  auto_hidden_count int,
  pending_reports   bigint,
  author_id         uuid,
  author_username   text,
  author_display_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    i.id, i.kind::text, i.title, i.caption, i.thumb_url, i.media_url,
    i.visibility::text, i.is_published, i.report_count,
    i.auto_hidden_at, i.auto_hidden_reason, i.auto_hidden_count,
    (SELECT count(*) FROM public.oculto_play_reports r
       WHERE r.item_id = i.id AND r.status = 'pending'),
    i.author_id, ap.username, ap.display_name
  FROM public.oculto_play_items i
  LEFT JOIN public.profiles ap ON ap.id = i.author_id
  WHERE i.auto_hidden_at IS NOT NULL
  ORDER BY i.auto_hidden_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_auto_hidden_list(int) TO authenticated;

-- 4) Decisão Master ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_auto_hidden_decide(
  p_item_id uuid,
  p_action  text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_action = 'restore' THEN
    UPDATE public.oculto_play_items
       SET is_published       = true,
           auto_hidden_at     = NULL,
           auto_hidden_reason = NULL,
           auto_hidden_count  = NULL
     WHERE id = p_item_id;
    UPDATE public.oculto_play_reports
       SET status='dismissed', reviewed_at=now(), reviewed_by=auth.uid()
     WHERE item_id = p_item_id AND status='pending';

  ELSIF p_action = 'keep_hidden' THEN
    UPDATE public.oculto_play_items
       SET is_published = false
     WHERE id = p_item_id;
    UPDATE public.oculto_play_reports
       SET status='removed', reviewed_at=now(), reviewed_by=auth.uid()
     WHERE item_id = p_item_id AND status='pending';

  ELSIF p_action = 'purge' THEN
    UPDATE public.oculto_play_reports
       SET status='removed', reviewed_at=now(), reviewed_by=auth.uid()
     WHERE item_id = p_item_id;
    DELETE FROM public.oculto_play_items WHERE id = p_item_id;

  ELSE
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', p_action, 'item_id', p_item_id);
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_auto_hidden_decide(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIM — Etapa 10
-- ============================================================================
