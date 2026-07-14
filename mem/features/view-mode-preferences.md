---
name: View Mode Preferences (Simples/Personalizado/Completo)
description: oculto_user_experience_preferences + useViewModePreferences + aba Experiência do Oculto em Settings + CustomizeHomeSectionsModal. Base para integração futura no RealFeed via isSectionEnabled().
type: feature
---
- Tabela `oculto_user_experience_preferences` (user_id UNIQUE, view_mode CHECK simple|custom|complete, custom_sections jsonb, has_seen_view_mode_modal, modal_snoozed_until, version).
- RLS: self-read/insert/update + master_admin all via `_is_master_admin`. Trigger updated_at compartilhado (`public.set_updated_at`).
- Realtime habilitado para sync entre dispositivos.
- Migração idempotente popula usuários existentes com view_mode='simple'.
- Config central: `src/config/homeSections.ts` com `HOME_SECTIONS` (19 seções), `DEFAULT_SIMPLE_SECTIONS` (só modo_card true), `DEFAULT_COMPLETE_SECTIONS` (tudo true), `ALWAYS_ON_SECTIONS` (modo_card).
- Hook: `useViewModePreferences()` — viewMode/customSections/isSectionEnabled/setViewMode/toggleSection/setCustomSections/markModalSeen/snoozeModal(30d)/resetToSimple/enableComplete. Auto-cria preferência no primeiro acesso. Optimistic via React Query (staleTime 5min, gcTime 30min). Fallback localStorage `oculto:view_mode_prefs_v1`.
- Settings: aba "Experiência" (8ª) em `/settings` com 3 cards (Simples/Personalizado/Completo). `CustomizeHomeSectionsModal` lista todas seções com switch + Saiba Mais + badges (pesada/Sessões Ocultas/sempre ativo) + Ativar tudo/Ocultar tudo/Restaurar padrão.
- IMPORTANTE: nesta etapa NÃO integrado no RealFeed (etapa de feed virá depois). Preferência apenas persiste.
- SQL: `supabase/external_sql/2026_06_03f_view_mode_preferences.sql`.
- Coexiste com o sistema legado `FeedModeProvider` (oculto_feed_modes_config + profiles.feed_mode) sem conflitos.
