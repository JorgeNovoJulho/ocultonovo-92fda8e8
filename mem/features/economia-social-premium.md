---
name: Economia Social Premium
description: Catálogo central de produtos sociais premium com cooldown, daily_limit, min_plan, anti-abuso e ativação roteada via ASAAS
type: feature
---
- Tabelas: `oculto_social_economy_products` (catálogo), `oculto_social_economy_purchases` (log + idempotência via asaas_payment_id).
- 8 produtos seed: energia_magnetica_30/60, pass_vip_social_24h/7d, conexoes_ocultas_x3, entrada_prioritaria, destaque_salas_60, destaque_feed_vivo.
- RPCs: `social_economy_list`, `social_economy_can_purchase`, `social_economy_purchase_create`, `social_economy_activate`, `social_economy_mark_paid`, admin `social_economy_admin_upsert/toggle/metrics`.
- Roteamento por `kind`: ativa motores existentes (magnetic_boosts, vip_social_pass) ou só registra ativação para os outros.
- Anti-abuso: cooldown_minutes + daily_limit + min_plan validados no backend.
- Webhook ASAAS deve chamar `social_economy_mark_paid(asaas_payment_id)` para ativar.
- Hook: `useSocialEconomyCatalog`, `checkCanPurchase`, `createSocialEconomyPurchase`.
- Admin: aba "Economia" em `/admin/universo-social`.
