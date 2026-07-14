---
name: Beta access grants (simulação sem cobrança)
description: Fluxo Beta de compra/assinatura de Canais VIP sem cobrança real — tabela beta_access_grants, RPCs grant/has/revoke, trigger auto-revoke ao ativar monetização, integrado a useMediaAccess e useIsSubscribedTo
type: feature
---

# Beta Access Grants — Canais VIP sem cobrança real

## O quê
Durante o Beta (`platform_mode='beta'`), com `paid_content_enabled=false` ou `subscriptions_enabled/vip_channels_enabled=false`, o usuário NÃO faz cobrança ASAAS. Em vez disso libera acesso temporário via `beta_access_grants`.

## Tabela
`public.beta_access_grants` — colunas chave: `user_id` (auth), `profile_id`, `creator_id` (profiles.id), `post_id`, `plan_id`, `grant_type` (`paid_content` | `creator_subscription`), `status` (`active|revoked|expired`), `expires_at`, `metadata`.
Índice único parcial impede grants ativos duplicados (por post ou por creator).

## RPCs (todos `SECURITY DEFINER SET search_path=public`)
- `grant_beta_access(p_grant_type, p_post_id, p_creator_id, p_plan_id, p_metadata)` — valida modo beta + feature paga OFF, insere e retorna a row.
- `has_beta_post_access(p_user, p_post)` / `has_beta_creator_access(p_user, p_creator)` — booleans.
- `revoke_beta_monetization_grants()` — master only; revoga todos grants ativos.
- `beta_grants_summary()` — master only; métricas JSON.

## Trigger
`auto_revoke_beta_grants_on_monetization` em `platform_runtime_settings`: quando QUALQUER toggle de monetização (`monetization/subscriptions/paid_content/vip_channels`) vira true, revoga todos grants ativos.

## Frontend
- `useBetaGrants.tsx` — `useCreateBetaGrant`, `useHasBetaPostAccess`, `useHasBetaCreatorAccess`, `useBatchBetaPostAccess`, `useBetaGrantsSummary`, `useRevokeBetaGrants`.
- `useMediaAccess` agora retorna `realAccess OR betaAccess` (single + batch).
- `useIsSubscribedTo` agora retorna ativo se houver subscription real OU `has_beta_creator_access`.
- `PaidContentCheckoutModal` — quando `useBetaGuard('paid_content').isLocked`, mostra card âmbar "Modo Beta · Simulação" com botão "Liberar acesso Beta (sem cobrança)" que chama `grant_beta_access`.
- `PlanPaymentModal` — quando subscriptions OU vip_channels lockados, `handleConfirmPayment` cria beta grant em vez de upsert real em `subscriptions` (NÃO grava transactions). Banner âmbar e tela de sucesso adaptada.
- `BetaGrantsCard` em `/admin/beta-control` — exibe métricas + botão "Encerrar acessos beta de monetização".

## SQL
`supabase/external_sql/2026_05_25_beta_access_grants.sql` — idempotente, aplicar no SQL Editor do Supabase EXTERNO.
