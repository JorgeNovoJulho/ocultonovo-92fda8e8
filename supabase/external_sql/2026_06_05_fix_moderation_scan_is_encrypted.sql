-- =========================================================================
-- 2026-06-05 — HOTFIX: trigger fn_moderation_scan_message falhava com
--   ERROR: record "new" has no field "is_encrypted"
-- porque a coluna não existe em public.messages. Isso quebrava QUALQUER
-- INSERT na tabela, incluindo o envio da mensagem de boas-vindas.
--
-- Solução:
--   1) Garantir a coluna messages.is_encrypted boolean DEFAULT false (idempotente).
--   2) Reescrever a função para ler o campo de forma segura via to_jsonb(NEW),
--      retornando NEW silenciosamente caso o campo não exista, em vez de quebrar.
-- Idempotente — pode rodar quantas vezes precisar.
-- =========================================================================

-- 1) Coluna defensiva (não falha se já existir)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false;

-- 2) Função robusta — tolera ausência futura da coluna
CREATE OR REPLACE FUNCTION public.fn_moderation_scan_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k RECORD;
  body text;
  snip text;
  v_is_encrypted boolean;
  v_content text;
BEGIN
  -- Lê campos de forma defensiva via to_jsonb (não quebra se a coluna sumir).
  BEGIN
    v_is_encrypted := COALESCE((to_jsonb(NEW)->>'is_encrypted')::boolean, false);
  EXCEPTION WHEN others THEN
    v_is_encrypted := false;
  END;

  IF v_is_encrypted THEN
    RETURN NEW; -- E2EE: não escaneamos
  END IF;

  BEGIN
    v_content := COALESCE(to_jsonb(NEW)->>'content', '');
  EXCEPTION WHEN others THEN
    v_content := '';
  END;

  body := lower(v_content);
  IF body = '' THEN RETURN NEW; END IF;

  FOR k IN
    SELECT id, term, severity FROM public.oculto_moderation_keywords WHERE enabled = true
  LOOP
    IF position(lower(k.term) IN body) > 0 THEN
      snip := substr(v_content, GREATEST(1, position(lower(k.term) IN body) - 30), 120);
      BEGIN
        INSERT INTO public.oculto_moderation_keyword_hits
          (keyword_id, term_matched, severity, message_id, conversation_id, sender_id, snippet)
        VALUES (k.id, k.term, k.severity, NEW.id, NEW.conversation_id, NEW.sender_id, snip);
      EXCEPTION WHEN others THEN
        -- nunca quebra o INSERT da mensagem por falha de moderação
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
