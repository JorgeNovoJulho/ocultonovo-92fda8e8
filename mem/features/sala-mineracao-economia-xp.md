---
name: Sala Mineração — Economia de XP
description: Sala de retenção com slug 'mineracao'; XP por minuto idle + eventos, painel ao vivo (saldo, progresso, avisos, ledger) e bypass master nos requisitos
type: feature
---
Slug: `mineracao` (regular). Requisitos: aura_level ≥ 2, social_score ≥ 500, prestige_xp ≥ 500.
**Master admin (ocultomaster) bypassa requisitos** em `DiscoveryUniverseCarousel.onCta` via `useIsMasterAdmin()`.

Backend: `oculto_aura_room_mining_rules` (catálogo editável master), `oculto_aura_room_mining_ledger` (idempotência via UNIQUE user_id+rule_key+ref_key; coluna `message_id` opcional).
RPCs: `aura_room_mining_rules_list/upsert`, `aura_room_mining_tick(slug)` (idempotente por bucket de minuto), `aura_room_mining_award(slug, rule_key, ref_key, target_user_id, message, message_id)`, `aura_room_mining_message_xp(slug, ids[])`, `aura_room_mining_metrics_24h()`.
Regras default: per_minute_idle 1 · per_quality_message 1 · receive_pulse 1 · receive_highlight 5 · invite_accepted 5 · approach 2 · receive_reaction 1 · receive_like 2 · receive_dislike -3 (clamp ≥ 0) · reply_mention 2.
Anti-bot em per_quality_message: ≥12 chars, ≥3 palavras distintas, blacklist (oi/ola/kkk), rate-limit 20s, similaridade pg_trgm > 0.75 nas últimas 5 msgs em 10 min — retorna `reason`: `rate_limited`, `msg_too_short`, `msg_low_diversity`, `msg_blacklisted`, `msg_repetitive`.

Frontend:
- `useMiningRoom(slug)` faz tick 60s (visibility-aware) + expõe `awardEvent(rule, refKey, targetUserId?, message?, messageId?)`. Dispara `AURA_XP_LEDGER_LOCAL_EVENT` no sucesso, `MINING_MSG_XP_UPDATE` para increments otimistas por mensagem e `MINING_RULE_BLOCKED` com `{ reason, cooldownUntil }` nas falhas anti-bot.
- `useMiningMessageXp(slug, ids[])` agrega XP por mensagem (batch + polling 10s + evento local).
- `MiningBalanceChip` (header do chat) mostra saldo de XP em tempo real com pulse no delta.
- `MiningSidePanel` (logo abaixo do header em `AuraRoomChat` quando `isMineracao`) renderiza: (1) barra de progresso para o próximo nível usando `useAuraProgress` (`xp_in_level`/`xp_to_next`), (2) avisos de regras bloqueadas com motivo amigável + countdown, (3) últimas 8 entradas do ledger via SELECT + realtime postgres_changes INSERT filtrado por `user_id`.

Admin: aba "Sala Mineração" em `/admin/aura-xp-economy` (master-only).
