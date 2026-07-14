# Runbook de Incidentes — Pagamentos ASAAS / Oculto

> **Audiência:** time de operações + admins master.
> **Princípio:** triagem em ≤5 min · diagnóstico em ≤15 min · mitigação em ≤30 min.
> **Webhook canônico:** `pix-webhook` (modular, em `supabase/functions/pix-webhook/handlers/`).
> **Idempotência:** garantida via `oculto_asaas_webhook_logs.asaas_event_id` (UNIQUE).

---

## 1. Triagem rápida (≤ 5 min)

1. Abrir **Admin Master → Status Operacional ASAAS** (`/admin/asaas-ops-status`).
2. Verificar:
   - **Health badge**: `healthy` / `unhealthy` / `stale`
   - **Último evento**: deve ser <30 min em horário comercial
   - **Falhas 24h**: aceitável <5; alertar se ≥10
   - **Latência média**: ok <1500 ms; investigar >3000 ms
3. Olhar **Eventos por tipo** — se `PAYMENT_RECEIVED` parou de chegar mas `SUBSCRIPTION_*` continua, suspeitar de filtro/firewall ASAAS.

| Sintoma | Ação imediata |
|---|---|
| `health = stale` | Conferir webhook URL no painel ASAAS, fazer ping com `pix-webhook` smoke test |
| `health = unhealthy` (>5 falhas) | Ver logs da edge function `pix-webhook`, abrir **Auditoria Antifraude** |
| Nenhum `PAYMENT_RECEIVED` em >2h | Pode ser ausência real de tráfego — confirmar com **Central Financeira** |
| `duplicated_24h` muito alto | OK — significa que ASAAS está reentregando e a idempotência está protegendo |

---

## 2. Diagnóstico (≤ 15 min)

### 2.1 Logs da edge function

- **Lovable Cloud → Edge Functions → `pix-webhook` → Logs** (ver últimas 100 linhas)
- Filtrar por: `error`, `failed`, `[pix-webhook]`
- Logs equivalentes via SQL:
  ```sql
  SELECT received_at, event_type, status, error_message, processing_ms
    FROM public.oculto_asaas_webhook_logs
   WHERE status IN ('failed','received')
     AND received_at > NOW() - INTERVAL '6 hours'
   ORDER BY received_at DESC
   LIMIT 50;
  ```

### 2.2 Antifraude

- **`/admin/antifraud-financeiro`** — score por usuário, incidentes high/critical
- **`/admin/antifraud-audit`** — histórico filtrável + CSV (decisões automáticas e manuais)
- Para Discord alerts: ver canal #ops-financeiro (alimentado por `trg_fraud_incident_discord`)

### 2.3 Stress test

- **`/admin/stress-test-report`** — última rodada deve ter:
  - Idempotência ≥99%
  - Falhas internas = 0
  - Latência avg <2000 ms
- Se métricas degradaram, executar nova rodada via `/admin/asaas-stress-test`.

---

## 3. Procedimentos de mitigação

### 3.1 Reprocessar webhook com segurança

> **REGRA DE OURO:** nunca reenviar payload manualmente sem checar `oculto_asaas_webhook_logs.asaas_event_id`. A idempotência protege, mas auditoria fica suja se reenviarmos sem necessidade.

**Cenário A — Webhook caiu, ASAAS reentregou e foi processado:**
- Não fazer nada. Confirmar via:
  ```sql
  SELECT asaas_event_id, status, processed_at
    FROM public.oculto_asaas_webhook_logs
   WHERE payment_id = '<id>' ORDER BY received_at DESC;
  ```

**Cenário B — Status `failed` num evento crítico (`PAYMENT_RECEIVED`):**
1. Identificar `payment_id` e `asaas_event_id`.
2. Verificar transação no painel ASAAS (status real lá).
3. Se ASAAS confirma `RECEIVED` mas nosso DB não, **reenviar via painel ASAAS**:
   - ASAAS Painel → Cobrança → Webhooks → "Reenviar"
   - Isso preserva o `asaas_event_id` e a idempotência. A entrada `failed` será sobrescrita.
4. Se reenvio não estiver disponível, usar o smoke test (`/admin/asaas-stress-test → "🧪 Smoke Test Sandbox"`) **somente em sandbox** para validar.

**Cenário C — Split errado / valores divergentes:**
- NUNCA mexer manualmente em `transaction_split_logs`.
- Abrir incidente, congelar wallet do criador (`/admin/antifraud-financeiro`), aguardar review.
- Compensação financeira passa por `oculto_apply_refund_debit` (RPC), nunca update direto.

### 3.2 Saque suspeito (`under_review`)

1. **`/admin/withdrawals`** → status `under_review`
2. Cruzar com **`/admin/antifraud-audit`** (filtrar `scope = withdraw_review`)
3. Se legítimo: aprovar; se fraude: marcar como `rejected` e congelar wallet.

### 3.3 Subscription quebrada (Premium/VIP não ativando)

1. **`/admin/asaas-subscriptions`** → buscar usuário
2. Conferir `subscription_id` no painel ASAAS
3. Se ASAAS diz `ACTIVE` mas nosso DB não atualizou → reenviar `SUBSCRIPTION_UPDATED` via painel ASAAS
4. Se persistir, último recurso: trigger manual via SQL (com auditoria):
   ```sql
   SELECT public.oculto_apply_subscription_event(
     p_event_type := 'SUBSCRIPTION_UPDATED',
     p_subscription_id := '<asaas_sub_id>',
     p_status := 'ACTIVE'
   );
   ```

---

## 4. Escalação

| Severidade | Quem chamar | SLA |
|---|---|---|
| `stale` >6h | Plantão dev | 2h |
| `unhealthy` ou perda financeira | Tech Lead + Master Admin | 30 min |
| Vazamento de dados | Tech Lead + DPO + advogado | imediato |
| Fraude coordenada (>3 chargebacks/h) | Master Admin + Antifraude | 15 min |

---

## 5. Pós-incidente

1. Registrar timeline em `/admin/audit-page` (action: `incident_resolved`)
2. Exportar CSV da auditoria antifraude do período
3. Atualizar este runbook se novo padrão foi observado
4. Avaliar se precisa de novo trigger ou regra antifraude

---

## 6. Atalhos úteis

- Status operacional: `/admin/asaas-ops-status`
- Auditoria antifraude: `/admin/antifraud-audit`
- Stress test report: `/admin/stress-test-report`
- Central Financeira: `/admin/asaas-finance-central`
- Webhook logs (cru): `/admin/asaas-webhook-logs`
- Subscriptions: `/admin/asaas-subscriptions`
- Antifraude (scores): `/admin/antifraud-financeiro`
