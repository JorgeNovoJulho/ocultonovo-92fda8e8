-- =============================================================
-- Anti-falso-online: zera is_online para usuários cujo
-- last_seen está stale (> 2 min). Roda via pg_cron a cada 1 min.
--
-- Combinado com o fix no client (usePresence só envia heartbeat
-- quando a aba está visível) garante que background tabs / PWA
-- dormindo somem da lista em poucos minutos, sem flicker.
--
-- Idempotente: pode rodar várias vezes sem erro.
-- =============================================================

-- 1) Função que faz o sweep
CREATE OR REPLACE FUNCTION public.sweep_stale_online_status()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.profiles
     SET is_online = false
   WHERE is_online = true
     AND (last_seen IS NULL OR last_seen < (now() - interval '2 minutes'));
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Garante permissão de execução (apenas service_role precisa, mas
-- liberar para authenticated não causa risco — função não recebe args).
GRANT EXECUTE ON FUNCTION public.sweep_stale_online_status() TO service_role;

-- 2) Agendamento via pg_cron (a cada 60s)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove agendamento anterior (idempotência)
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'sweep_stale_online_status_every_minute';

    PERFORM cron.schedule(
      'sweep_stale_online_status_every_minute',
      '* * * * *',
      $cron$ SELECT public.sweep_stale_online_status(); $cron$
    );
  END IF;
END $$;

-- 3) Garante REPLICA IDENTITY FULL em profiles para o realtime
--    propagar o flip is_online=true → false corretamente ao client.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- 4) Realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;
END $$;

-- 5) Roda uma vez agora para limpar o estado atual sujo
SELECT public.sweep_stale_online_status() AS users_marked_offline;
