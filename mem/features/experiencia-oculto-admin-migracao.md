---
name: Experiência do Oculto — Admin & Migração
description: Modos de Visualização — modal de migração, painel Admin Master, Saiba Mais, RPCs oculto_experience_*, settings runtime aplicados em isSectionEnabled/HiddenSessionsEntry/SessoesOcultasPage e fetchOrCreate.
type: feature
---

# Experiência do Oculto — Camada de Admin + Migração + Runtime

## Hook de settings
`src/hooks/useExperienceSettings.ts` — react-query, staleTime 5min, fallback DEFAULT_EXPERIENCE_SETTINGS (não quebra se RPC indisponível). Consome RPC pública `oculto_experience_settings_get`.

## Aplicação runtime (Etapa 5)
- `useViewModePreferences`:
  - `fetchOrCreate(userId, defaultMode)` recebe `default_existing_user_mode` das settings ao criar a preferência inicial.
  - `isSectionEnabled` aplica override `sections_config[key].in_simple` apenas no Modo Simples; Modo Completo segue defaults do código; Custom segue escolha do usuário.
  - `shouldShowMigrationModal` respeita `settings.enabled === false` e `force_migration_modal === false`.
- `HiddenSessionsEntry`: oculta atalho quando `hidden_sessions_enabled === false`; usa `hidden_sessions_title` configurável.
- `SessoesOcultasPage`: redireciona para `/feed` se desligado; usa `hidden_sessions_title`/`hidden_sessions_description`; filtra a listagem por `sections_config[key].in_hidden_sessions` (fallback para `HOME_SECTIONS.hiddenSessions`).

## Componentes (etapa 4)
- `SectionInfoDialog` — adapta `HomeSectionConfig` para `DiscoverySlide` e reaproveita `SlideInfoDialog`/`useSlideGuide` (oculto_slide_guides).
- `ViewModeMigrationModal` + `ViewModeMigrationGate` (montado em DashboardLayout, bloqueia rotas críticas).
- `AdminExperienceOcultoPage` em `/admin/experiencia-oculto`.

## Banco (Supabase externo)
SQL files:
- `supabase/external_sql/2026_06_03h_experience_mode_admin.sql` (tabelas/RPCs).
- `supabase/external_sql/2026_06_03i_view_mode_section_guides_seed.sql` (seed dos 18 guideKeys das seções da Home em `oculto_slide_guides`, ON CONFLICT DO NOTHING).

Tabelas:
- `oculto_experience_mode_settings` (singleton) — escrita só `_is_master_admin()`.
- `oculto_experience_mode_logs` — auditoria master only.

RPCs (SECURITY DEFINER):
`oculto_experience_settings_get` (público), `oculto_experience_settings_update` (master), `oculto_experience_modal_reset_all`, `oculto_experience_metrics`, `oculto_experience_logs_list`.
