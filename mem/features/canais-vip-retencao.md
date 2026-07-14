---
name: Canais VIP — Retenção e Analytics
description: Continue Lendo (creator_content_read_progress), posts fixados (is_pinned/pinned_at), share Web Share API, analytics RPC creator_channel_analytics, toggles vip_* em platform_runtime_settings
type: feature
---
- SQL: supabase/external_sql/2026_05_25_channels_retention.sql
- Hooks: useReadProgress (useUpsertReadProgress/useContinueReading/useTrackNarrativeProgress), useChannelAnalytics
- UI: ContinueReadingStrip (topo do canal p/ visitantes), ChannelAnalyticsCard (aba "Canal VIP" no /creator-dashboard), Pin/Share no dropdown do ContentCard
- Admin: VIP_CHANNEL_TOGGLES em AdminBetaControlPage (vip_narrative/feed_cards/continue_reading/pin/special_reactions/schedule/share/analytics)
- Reuso: comments/reactions/scheduled_at/notificações já existem — não duplicar
