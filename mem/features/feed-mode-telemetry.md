---
name: Feed Mode Telemetry
description: oculto_feed_mode_events + log_feed_mode_event + feed_mode_metrics RPC; aba Métricas em /admin/modos-feed (distribuição, trocas, origem, série diária)
type: feature
---
- Tabela `oculto_feed_mode_events` (user_id, mode_from, mode_to, source: selector|onboarding|admin|system).
- RPC `log_feed_mode_event(p_mode_from, p_mode_to, p_source)` SECURITY DEFINER — fire-and-forget dentro de `setMode` no `FeedModeProvider`.
- RPC `feed_mode_metrics(p_days)` SECURITY DEFINER (master only) retorna jsonb: total_users, active_users, distribution (de profiles.feed_mode), switches por mode_to, by_source, daily series.
- `setMode(m, source?)` agora aceita origem; `FeedModePreviewGrid` envia `'onboarding'`, `FeedModeSelector` usa default `'selector'`.
- Admin `/admin/modos-feed` ganhou Tabs: Configuração + Métricas (cards KPI, barra de distribuição, sparkline diário).
- RLS: self-insert/self-read + master-all. Indexes por created_at, user_id, mode_to.
- SQL idempotente: `supabase/external_sql/2026_06_03e_feed_mode_telemetry.sql`.
