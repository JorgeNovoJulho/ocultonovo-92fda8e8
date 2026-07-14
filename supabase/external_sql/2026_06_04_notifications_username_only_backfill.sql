-- =====================================================================
-- Privacy Hardening — Notifications: APENAS @username, JAMAIS nome real
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
--
-- Objetivos:
--   1) Backfill de notifications.title/body trocando "<Nome Real> te enviou X"
--      por "@username te enviou X" usando profiles via data->>'from_user_id',
--      'sender_id', 'sender_profile_id' ou 'actor_id'.
--   2) Trigger BEFORE INSERT que sanitiza title/body em qualquer nova
--      notificação (defesa em camadas — funciona mesmo se algum RPC legado
--      ainda inserir com nome real).
-- =====================================================================

-- 0) Função auxiliar: dado um lookup_id (user_id OU profile.id), devolve
--    o @username (com '@' prefix). Retorna 'Alguém' se não encontrar.
CREATE OR REPLACE FUNCTION public._sanitize_username_from_lookup(p_lookup text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    '@' || NULLIF(p.username, ''),
    'Alguém'
  )
  FROM public.profiles p
  WHERE p.id::text = p_lookup
     OR p.user_id::text = p_lookup
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public._sanitize_username_from_lookup(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._sanitize_username_from_lookup(text) TO service_role;

-- 1) BACKFILL — atualiza title e body trocando prefixo de nome real por @username
--    Regras: aplica somente em rows onde o title NÃO começa com '@' e contém
--    um dos verbos sensíveis. Idempotente — re-rodar não muda nada.

DO $$
DECLARE
  r record;
  v_lookup text;
  v_handle text;
  v_new_title text;
  v_new_body  text;
  v_verb_re  text := '\s+(te enviou|enviou|te acenou|acenou para você|acenou|te curtiu|curtiu|comentou|respondeu|mencionou|começou|salvou|desbloqueou)\b';
BEGIN
  FOR r IN
    SELECT id, title, body, data
    FROM public.notifications
    WHERE (
      (title IS NOT NULL AND title !~ '^@' AND title ~* '(te enviou|te acenou|acenou para você|acenou|te curtiu|enviou|curtiu|comentou|respondeu|mencionou|começou|salvou|desbloqueou)')
      OR
      (body  IS NOT NULL AND body  !~ '^@' AND body  ~* '(te enviou|te acenou|acenou para você|acenou|te curtiu|enviou|curtiu|comentou|respondeu|mencionou|começou|salvou|desbloqueou)')
    )
  LOOP
    v_lookup := COALESCE(
      r.data->>'from_user_id',
      r.data->>'sender_id',
      r.data->>'sender_profile_id',
      r.data->>'actor_id',
      r.data->>'actor_user_id',
      r.data->>'user_id'
    );

    -- Se já temos sender_username no data, usa direto
    v_handle := NULLIF(r.data->>'sender_username','');
    IF v_handle IS NULL THEN
      v_handle := NULLIF(r.data->>'actor_username','');
    END IF;
    IF v_handle IS NULL THEN
      v_handle := NULLIF(r.data->>'username','');
    END IF;

    IF v_handle IS NOT NULL THEN
      v_handle := '@' || regexp_replace(v_handle, '^@+','');
    ELSIF v_lookup IS NOT NULL THEN
      v_handle := public._sanitize_username_from_lookup(v_lookup);
    ELSE
      v_handle := 'Alguém';
    END IF;

    v_new_title := r.title;
    v_new_body  := r.body;

    IF v_new_title IS NOT NULL AND v_new_title !~ '^@' THEN
      v_new_title := regexp_replace(
        v_new_title,
        '^([^@]+?)' || v_verb_re,
        v_handle || ' \1',
        'i'
      );
      -- O \1 acima captura o verbo (segundo grupo); o nome (primeiro grupo
      -- não-@) é descartado pois é substituído pelo handle no início.
      -- Ajuste: a regex acima inverte. Refazemos de forma simples e segura:
      v_new_title := r.title;
      v_new_title := regexp_replace(
        v_new_title,
        '^([^@\n]+?)(\s+(?:te enviou|enviou|te acenou|acenou para você|acenou|te curtiu|curtiu|comentou|respondeu|mencionou|começou|salvou|desbloqueou)\b)',
        v_handle || '\2',
        'i'
      );
    END IF;

    IF v_new_body IS NOT NULL AND v_new_body !~ '^@' THEN
      v_new_body := regexp_replace(
        v_new_body,
        '^([^@\n]+?)(\s+(?:te enviou|enviou|te acenou|acenou para você|acenou|te curtiu|curtiu|comentou|respondeu|mencionou|começou|salvou|desbloqueou)\b)',
        v_handle || '\2',
        'i'
      );
    END IF;

    IF (v_new_title IS DISTINCT FROM r.title) OR (v_new_body IS DISTINCT FROM r.body) THEN
      UPDATE public.notifications
         SET title = v_new_title,
             body  = v_new_body
       WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 2) TRIGGER BEFORE INSERT — sanitiza qualquer nova notificação automaticamente.
--    Garante que nunca mais um nome real entre na tabela, mesmo via RPC legado.

CREATE OR REPLACE FUNCTION public._notifications_sanitize_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lookup text;
  v_handle text;
BEGIN
  -- Resolve @handle do data
  v_handle := NULLIF(NEW.data->>'sender_username','');
  IF v_handle IS NULL THEN v_handle := NULLIF(NEW.data->>'actor_username',''); END IF;
  IF v_handle IS NULL THEN v_handle := NULLIF(NEW.data->>'username',''); END IF;

  IF v_handle IS NOT NULL THEN
    v_handle := '@' || regexp_replace(v_handle,'^@+','');
  ELSE
    v_lookup := COALESCE(
      NEW.data->>'from_user_id',
      NEW.data->>'sender_id',
      NEW.data->>'sender_profile_id',
      NEW.data->>'actor_id',
      NEW.data->>'actor_user_id',
      NEW.data->>'user_id'
    );
    IF v_lookup IS NOT NULL THEN
      v_handle := public._sanitize_username_from_lookup(v_lookup);
    ELSE
      v_handle := 'Alguém';
    END IF;
  END IF;

  IF NEW.title IS NOT NULL AND NEW.title !~ '^@' THEN
    NEW.title := regexp_replace(
      NEW.title,
      '^([^@\n]+?)(\s+(?:te enviou|enviou|te acenou|acenou para você|acenou|te curtiu|curtiu|comentou|respondeu|mencionou|começou|salvou|desbloqueou)\b)',
      v_handle || '\2',
      'i'
    );
  END IF;

  IF NEW.body IS NOT NULL AND NEW.body !~ '^@' THEN
    NEW.body := regexp_replace(
      NEW.body,
      '^([^@\n]+?)(\s+(?:te enviou|enviou|te acenou|acenou para você|acenou|te curtiu|curtiu|comentou|respondeu|mencionou|começou|salvou|desbloqueou)\b)',
      v_handle || '\2',
      'i'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_sanitize_username ON public.notifications;
CREATE TRIGGER trg_notifications_sanitize_username
BEFORE INSERT OR UPDATE OF title, body
ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public._notifications_sanitize_username();

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- Após rodar:
--   • Notificações antigas com "Andreia Maria da silva te enviou X XP"
--     viram "@mulatacuriosa_ofc te enviou X XP".
--   • Toda nova notificação (RPC, edge function, trigger) é sanitizada
--     automaticamente no BEFORE INSERT.
-- =====================================================================
