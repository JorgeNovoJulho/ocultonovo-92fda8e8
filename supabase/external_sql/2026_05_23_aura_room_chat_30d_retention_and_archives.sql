-- =====================================================================
-- Retenção de 30 dias do chat de salas + arquivamento em log .txt
-- Backend EXTERNO (rvybbrkzmboqbhcemqar). Idempotente.
--
-- O que faz:
--   1) Cria oculto_aura_room_chat_archives (1 linha por sala/janela, com
--      o log .txt completo e datas inicial/final). Apenas master pode ler.
--   2) Remove a permissão de DELETE de usuários comuns sobre as mensagens
--      (oculto_aura_room_messages) — usuários NÃO podem mais apagar.
--      Master continua podendo apagar para moderação extrema.
--   3) Cria archive_aura_room_chats_30d(): empacota tudo com >30 dias num
--      arquivo .txt por sala, salva em archives e depois APAGA as
--      mensagens originais. Roda diariamente via pg_cron.
--   4) Cria aura_room_chat_live_stats() para o painel master mostrar
--      quantas mensagens vivas existem por sala.
-- =====================================================================

-- 0) Extensões necessárias (já costumam existir, mas garantimos)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Tabela de arquivos (.txt) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_aura_room_chat_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  byte_size integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aura_room_chat_archives_room_period
  ON public.oculto_aura_room_chat_archives (room_slug, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_aura_room_chat_archives_created
  ON public.oculto_aura_room_chat_archives (created_at DESC);

ALTER TABLE public.oculto_aura_room_chat_archives ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas para re-criar de forma estável
DROP POLICY IF EXISTS arch_read_master   ON public.oculto_aura_room_chat_archives;
DROP POLICY IF EXISTS arch_insert_master ON public.oculto_aura_room_chat_archives;
DROP POLICY IF EXISTS arch_delete_master ON public.oculto_aura_room_chat_archives;

-- Apenas master admin lê / mexe
CREATE POLICY arch_read_master
  ON public.oculto_aura_room_chat_archives
  FOR SELECT TO authenticated
  USING (public.is_master_admin());

CREATE POLICY arch_insert_master
  ON public.oculto_aura_room_chat_archives
  FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin());

CREATE POLICY arch_delete_master
  ON public.oculto_aura_room_chat_archives
  FOR DELETE TO authenticated
  USING (public.is_master_admin());

-- 2) Bloqueia DELETE de usuários comuns em oculto_aura_room_messages -----
DROP POLICY IF EXISTS "room_msgs_del"          ON public.oculto_aura_room_messages;
DROP POLICY IF EXISTS room_msgs_del_owner      ON public.oculto_aura_room_messages;
DROP POLICY IF EXISTS room_msgs_del_master     ON public.oculto_aura_room_messages;

-- Só master pode apagar mensagens; nenhum usuário comum pode mais apagar
CREATE POLICY room_msgs_del_master
  ON public.oculto_aura_room_messages
  FOR DELETE TO authenticated
  USING (public.is_master_admin());

-- 3) RPC: estatísticas vivas por sala (apenas master) --------------------
CREATE OR REPLACE FUNCTION public.aura_room_chat_live_stats()
RETURNS TABLE (
  room_slug text,
  message_count bigint,
  oldest timestamptz,
  newest timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.room_slug,
    COUNT(*)::bigint,
    MIN(m.created_at),
    MAX(m.created_at)
  FROM public.oculto_aura_room_messages m
  WHERE public.is_master_admin()
  GROUP BY m.room_slug
  ORDER BY MAX(m.created_at) DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.aura_room_chat_live_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aura_room_chat_live_stats() TO authenticated;

-- 4) RPC: arquiva tudo com >30 dias em log .txt e remove do chat ---------
CREATE OR REPLACE FUNCTION public.archive_aura_room_chats_30d()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff      timestamptz := now() - interval '30 days';
  v_archives    integer := 0;
  v_purged      integer := 0;
  v_room        record;
  v_content     text;
  v_pstart      timestamptz;
  v_pend        timestamptz;
  v_count       integer;
BEGIN
  -- Permitido para master OU para chamada de sistema (cron via SECURITY DEFINER
  -- + ausência de auth.uid()). Quando chamado de UI, exige master.
  IF auth.uid() IS NOT NULL AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_room IN
    SELECT DISTINCT room_slug
      FROM public.oculto_aura_room_messages
     WHERE created_at < v_cutoff
  LOOP
    -- Janela exata daquela sala (start/end)
    SELECT MIN(created_at), MAX(created_at), COUNT(*)
      INTO v_pstart, v_pend, v_count
      FROM public.oculto_aura_room_messages
     WHERE room_slug = v_room.room_slug
       AND created_at < v_cutoff;

    IF v_count = 0 THEN CONTINUE; END IF;

    -- Monta TXT: cabeçalho + linhas "[YYYY-MM-DD HH24:MI:SS] usuario: corpo"
    SELECT
      format(
        E'# Sala: %s\n# Período: %s  ->  %s\n# Mensagens: %s\n# Gerado em: %s\n# ---------------------------------------------------\n%s\n',
        v_room.room_slug,
        to_char(v_pstart AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
        to_char(v_pend   AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
        v_count,
        to_char(now()    AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
        string_agg(
          format(
            '[%s] %s: %s',
            to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
            COALESCE(p.username, p.display_name, LEFT(m.user_id::text,8)),
            COALESCE(NULLIF(REPLACE(m.body, E'\n', ' '), ''), '[mensagem vazia]')
          ),
          E'\n' ORDER BY m.created_at
        )
      )
    INTO v_content
    FROM public.oculto_aura_room_messages m
    LEFT JOIN public.profiles p ON p.id = m.user_id OR p.user_id = m.user_id
    WHERE m.room_slug = v_room.room_slug
      AND m.created_at < v_cutoff;

    INSERT INTO public.oculto_aura_room_chat_archives
      (room_slug, period_start, period_end, message_count, byte_size, content)
    VALUES
      (v_room.room_slug, v_pstart, v_pend, v_count, octet_length(v_content), v_content);

    DELETE FROM public.oculto_aura_room_messages
     WHERE room_slug = v_room.room_slug
       AND created_at < v_cutoff;

    v_archives := v_archives + 1;
    v_purged   := v_purged + v_count;
  END LOOP;

  RETURN jsonb_build_object(
    'archives_created', v_archives,
    'messages_purged',  v_purged,
    'cutoff',           v_cutoff,
    'ts',               now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_aura_room_chats_30d() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_aura_room_chats_30d() TO authenticated;

-- 5) Agenda diária às 03:15 (UTC) ---------------------------------------
DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'aura_room_chat_archive_30d';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'aura_room_chat_archive_30d',
    '15 3 * * *',
    $cmd$ SELECT public.archive_aura_room_chats_30d(); $cmd$
  );
END$$;

NOTIFY pgrst, 'reload schema';
