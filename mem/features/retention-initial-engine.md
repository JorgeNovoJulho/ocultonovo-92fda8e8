---
name: Retention Initial Engine
description: Engine de Retenção Inicial Inteligente — D1-D7, missões, ciclos sociais, abandon card, founder progress, admin /admin/retention
type: feature
---

# Retenção Inicial Inteligente

Objetivo: criar movimento, curiosidade e hábito nos primeiros 7 dias, sem spam.

## Tabelas (prefixo `oculto_`)
- `oculto_retention_progress` (user_id PK, retention_day 1-7, completed_missions jsonb, abandon_card_dismissed_at)
- `oculto_retention_missions_config` (key PK, title, cta_*, reward, min/max_day, sort_order, active)
- `oculto_retention_alerts_config` (key, hour_start/end, max_per_day)
- `oculto_retention_alerts_log` (anti-spam por user+key+dia)
- `oculto_social_cycles_config` (manhã/tarde/noite/madrugada por hora SP)
- `oculto_founder_progress` (points, tier 0-5, perks_unlocked)

## RPCs (todas plpgsql + SET search_path = public)
- `retention_touch()` — chamado 2s após login (useRetentionTouch)
- `retention_state_get()` — dia, hours_since_active, missões concluídas
- `retention_missions_for_me()` — missões do dia atual
- `retention_mission_complete(p_key)` — idempotente, devolve reward
- `retention_dismiss_abandon_card()` — registra dismissal (válido 24h)
- `social_cycle_current()` — ciclo ativo agora (timezone America/Sao_Paulo)
- `retention_alert_can_send(p_user, p_key)` — gate de push (usado por process-reengagement)
- `founder_progress_get()` / `founder_progress_award(points, reason)`

## Frontend
- Hooks: `src/hooks/retention/useRetention.ts`
- Componentes (lazy, injetados em `RealFeed.tsx` no bloco socialStripsReady):
  - `AbandonReturnCard` — só aparece se `hours_since_active >= 24` e não foi dispensado nas últimas 24h
  - `SocialCycleBadge` — micro-pill com emoji + label do ciclo atual
  - `RetentionMissionsStrip` — 3 missões max, scroll-snap horizontal, dismissível
  - `FounderProgressCard` — barra de progresso (usar onde necessário; não está no feed)

## Regras
- Sem novo canal realtime (usa `SocialRealtimeProvider` se necessário)
- Sem polling agressivo: staleTime 5min para state/missions, 15min para cycle
- Mobile-first, flat, sem shadows pesados (cumpre Mobile Perf Golden Rules)
- Alertas de push reaproveitam `process-reengagement` + `retention_alert_can_send`
- Cycle usa timezone fixo `America/Sao_Paulo` no SQL

## Admin
- Rota `/admin/retention` (lazy em App.tsx) — tabs Missões | Alertas | Ciclos Sociais
- CRUD direto via Supabase external + RLS `is_admin_master()`

## SQL aplicado
- `supabase/external_sql/2026_05_21_retention_engine.sql` (idempotente)
