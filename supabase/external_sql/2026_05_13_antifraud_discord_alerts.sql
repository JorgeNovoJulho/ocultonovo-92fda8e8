-- =====================================================================
-- ANTIFRAUDE — Alertas Discord (under_review + severidade high/critical)
-- Idempotente. Roda no Supabase EXTERNO.
-- Defensivo: só cria triggers se as tabelas existirem.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper: dispara mensagem ao Discord (silencioso em caso de falha)
CREATE OR REPLACE FUNCTION public.oculto_notify_discord(p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
BEGIN
  BEGIN
    SELECT discord_webhook_url INTO v_url
      FROM public.pix_gateway_config
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL;
  END;

  IF v_url IS NULL OR length(v_url) < 10 THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json'),
    body    := jsonb_build_object('content', left(p_message, 1900))
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- nunca quebra fluxo financeiro por falha de notificação
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_notify_discord(TEXT) TO authenticated, service_role;

-- =====================================================================
-- Trigger: incidentes antifraude high/critical -> alerta Discord
-- Só instala se a tabela existir
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='oculto_fraud_incidents'
  ) THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.trg_fraud_incident_discord()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $f$
      BEGIN
        IF NEW.severity IN ('high','critical') THEN
          PERFORM public.oculto_notify_discord(
            format('🚨 **Antifraude — %s**%sUsuário: `%s`%sRegra: `%s`%sMotivo: %s',
              upper(NEW.severity), E'\n', NEW.user_id, E'\n',
              NEW.rule_code, E'\n', COALESCE(NEW.reason,'(sem detalhes)'))
          );
        END IF;
        RETURN NEW;
      END;
      $f$;
    $body$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_fraud_incident_discord ON public.oculto_fraud_incidents';
    EXECUTE 'CREATE TRIGGER trg_fraud_incident_discord
             AFTER INSERT ON public.oculto_fraud_incidents
             FOR EACH ROW EXECUTE FUNCTION public.trg_fraud_incident_discord()';
  ELSE
    RAISE NOTICE 'Tabela oculto_fraud_incidents ainda não existe — trigger antifraude pulado.';
  END IF;
END $$;

-- =====================================================================
-- Trigger: saque marcado como under_review -> alerta Discord
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='withdraw_requests'
  ) THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.trg_withdraw_under_review_discord()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $f$
      BEGIN
        IF NEW.status = 'under_review' AND (OLD.status IS DISTINCT FROM 'under_review') THEN
          PERFORM public.oculto_notify_discord(
            format('🔍 **Saque em revisão antifraude**%sUsuário: `%s`%sValor: R$ %s%sID: `%s`',
              E'\n', NEW.user_id, E'\n', COALESCE(NEW.amount::text,'?'), E'\n', NEW.id)
          );
        END IF;
        RETURN NEW;
      END;
      $f$;
    $body$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_withdraw_under_review_discord ON public.withdraw_requests';
    EXECUTE 'CREATE TRIGGER trg_withdraw_under_review_discord
             AFTER INSERT OR UPDATE OF status ON public.withdraw_requests
             FOR EACH ROW EXECUTE FUNCTION public.trg_withdraw_under_review_discord()';
  ELSE
    RAISE NOTICE 'Tabela withdraw_requests não existe — trigger de saque pulado.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
