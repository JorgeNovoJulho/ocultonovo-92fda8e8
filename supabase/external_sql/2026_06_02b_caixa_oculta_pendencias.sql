-- ============================================================
-- 2026_06_02b_caixa_oculta_pendencias.sql
-- Fecha pendências do escopo Caixa Oculta:
--   1) Notificação automática para vencedores (AFTER INSERT)
--   2) Validação backend dos limites de prêmios (settings.allow_second/third_prize)
--   3) Storage bucket público para capas (cox-covers) + policies
-- Idempotente.
-- ============================================================

-- ---------- 1) Trigger: notifica vencedores --------------
CREATE OR REPLACE FUNCTION public._cox_notify_winner()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_camp public.oculto_caixa_oculta_campaigns;
  v_prize public.oculto_caixa_oculta_prizes;
BEGIN
  SELECT * INTO v_camp FROM public.oculto_caixa_oculta_campaigns WHERE id = NEW.campaign_id;
  SELECT * INTO v_prize FROM public.oculto_caixa_oculta_prizes WHERE id = NEW.prize_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.user_id,
    'system',
    '🎁 Você ganhou na Caixa Oculta!',
    COALESCE(v_prize.title, 'Prêmio') || ' — ' || COALESCE(v_camp.title, 'Caixa Oculta'),
    jsonb_build_object(
      'kind', 'caixa_oculta_winner',
      'campaign_id', NEW.campaign_id,
      'prize_id', NEW.prize_id,
      'prize_position', NEW.prize_position,
      'prize_title', v_prize.title,
      'campaign_title', v_camp.title
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- nunca derrubar o sorteio por falha de notificação
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cox_notify_winner ON public.oculto_caixa_oculta_winners;
CREATE TRIGGER trg_cox_notify_winner
AFTER INSERT ON public.oculto_caixa_oculta_winners
FOR EACH ROW EXECUTE FUNCTION public._cox_notify_winner();


-- ---------- 2) Validação de limites de prêmios -----------
CREATE OR REPLACE FUNCTION public._cox_validate_prize_position()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_allow2 boolean;
  v_allow3 boolean;
BEGIN
  SELECT allow_second_prize, allow_third_prize
    INTO v_allow2, v_allow3
    FROM public.oculto_caixa_oculta_settings
    LIMIT 1;

  IF NEW.prize_position NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'invalid_prize_position';
  END IF;
  IF NEW.prize_position = 2 AND COALESCE(v_allow2, true) = false THEN
    RAISE EXCEPTION '2o_premio_desabilitado';
  END IF;
  IF NEW.prize_position = 3 AND COALESCE(v_allow3, true) = false THEN
    RAISE EXCEPTION '3o_premio_desabilitado';
  END IF;

  -- bloqueia categorias proibidas (dinheiro real / físico, se settings desabilitar)
  IF NEW.prize_kind IN ('money','physical') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.oculto_caixa_oculta_settings WHERE allow_physical_prizes = true
    ) THEN
      RAISE EXCEPTION 'prize_kind_nao_permitido';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cox_validate_prize ON public.oculto_caixa_oculta_prizes;
CREATE TRIGGER trg_cox_validate_prize
BEFORE INSERT OR UPDATE ON public.oculto_caixa_oculta_prizes
FOR EACH ROW EXECUTE FUNCTION public._cox_validate_prize_position();


-- ---------- 3) Storage bucket: capas (público leitura) ----
INSERT INTO storage.buckets (id, name, public)
VALUES ('cox-covers', 'cox-covers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cox_covers_public_read" ON storage.objects;
CREATE POLICY "cox_covers_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'cox-covers');

DROP POLICY IF EXISTS "cox_covers_owner_write" ON storage.objects;
CREATE POLICY "cox_covers_owner_write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cox-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "cox_covers_owner_update" ON storage.objects;
CREATE POLICY "cox_covers_owner_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'cox-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "cox_covers_owner_delete" ON storage.objects;
CREATE POLICY "cox_covers_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'cox-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

NOTIFY pgrst, 'reload schema';
