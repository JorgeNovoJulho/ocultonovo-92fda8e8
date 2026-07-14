-- Idempotência de webhooks: impede processar mesmo evento 2x
-- (proteção contra replay e retries do provider)

-- Limpa duplicatas pré-existentes mantendo a mais antiga
DELETE FROM public.webhook_events a
USING public.webhook_events b
WHERE a.id > b.id
  AND a.provider = b.provider
  AND a.event_id = b.event_id
  AND a.event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_provider_event
  ON public.webhook_events (provider, event_id)
  WHERE event_id IS NOT NULL;