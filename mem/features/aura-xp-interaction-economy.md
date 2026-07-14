---
name: Aura XP Interaction Economy
description: Catálogo configurável de custos/recompensas de XP nas interações do feed (like, dislike, comment, save, share, view_likers, view_comments)
type: feature
---
Engine: tabela `oculto_aura_xp_interaction_costs` (catálogo master) + `oculto_aura_xp_interaction_ledger` (idempotência via `ref_key UNIQUE`).
RPCs: `aura_xp_interaction_config_list`, `aura_xp_interaction_config_upsert` (master via email/username), `aura_xp_interaction_charge` (debita actor, premia receiver com GREATEST(0, ...)), `aura_xp_interaction_metrics_24h`.
Defaults: like 1/+1, dislike 1/-3, comment 1/+3, save 1/+2, share 1/+5, view_likers 5/+5, view_comments 5/+5.
Frontend: `useAuraXpInteraction.chargeAction()`; dispara `AURA_XP_INSUFFICIENT` quando saldo < custo. `InsufficientXpModal` montado globalmente em App.tsx mostra saldo, "Saiba mais" (AURA_XP_HOW_TO_STEPS) e "Ir ao Aura Match".
Regras: cobra apenas no insert (like/save/dislike), nunca no toggle-off; autor isento; view_likers/view_comments cobram 1x/dia/post; share usa hourBucket.
Painel: `/admin/aura-xp-economy` (masterOnly) lista/edita catálogo + métricas 24h.
