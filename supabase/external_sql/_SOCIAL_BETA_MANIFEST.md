# SQL Manifest — Social Beta / Experiências Ocultas

Atualizado: 2026-05-24

Todos os arquivos `2026_05_23_*social_beta*.sql` já foram aplicados no Supabase
EXTERNO ao longo do desenvolvimento. Eles permanecem versionados como histórico
auditável, **mas não devem ser re-executados individualmente**.

## Fonte da verdade (re-execução)

Para re-aplicar todo o módulo Social Beta do zero (DR, novo ambiente, rollback
seguro), execute APENAS:

- `2026_05_23_social_beta_COMPLETO_consolidado.sql` (672 linhas)

Este arquivo é idempotente e cobre:
- Schema base (sessions, visits, modules, cards, events, reports, slots)
- RLS policies
- Triggers
- RPCs (admin + runtime)
- Índices

## Arquivos históricos (NÃO re-executar individualmente)

Mantidos apenas para rastreabilidade de cada PR/feature incremental:

| Arquivo | Coberto pelo consolidado? |
|---|---|
| `2026_05_23_modulo_social_beta_base.sql` | sim |
| `2026_05_23_modulo_social_beta_sessions.sql` | sim |
| `2026_05_23_modulo_social_beta_visits.sql` | sim |
| `2026_05_23_social_beta_modules_cards_events.sql` | sim |
| `2026_05_23_social_beta_admin_actions.sql` | sim |
| `2026_05_23_social_beta_admin_rpcs.sql` | sim |
| `2026_05_23_social_beta_content_reports.sql` | sim |
| `2026_05_23_social_beta_reports_and_search.sql` | sim |
| `2026_05_23_social_beta_slot_analytics.sql` | sim |
| `2026_05_23_social_beta_slot_content.sql` | sim |
| `2026_05_23_social_beta_slot_drilldown.sql` | sim |

## SQLs paralelos (independentes — re-executáveis isoladamente)

- `2026_05_21_freeze_block_visibility.sql` — RLS de bloqueios (posts/profiles)
- `2026_05_22_discovery_match_definitive_audit_fix.sql` — discovery exclusion
- `2026_05_24_blocked_contacts_integrity_audit.sql` — auditoria de bloqueios
- `2026_05_24_account_cemetery.sql` — cemitério de contas
- `2026_05_24_aura_gifts_thanked_at.sql` — agradecimento de presentes
