# SQL Manifest — Comunidades Ocultas

Atualizado: 2026-06-05

Todos os arquivos `2026_06_05_communities_*.sql` foram aplicados em ordem
no Supabase EXTERNO durante o desenvolvimento incremental. Permanecem
versionados como histórico auditável e podem ser re-executados de forma
idempotente (todos usam `IF NOT EXISTS` / `CREATE OR REPLACE`).

## Ordem de re-execução (DR / novo ambiente)

Execute em ordem cronológica:

1. `2026_06_05_communities_base.sql` — schema base (categories, communities, members, topics, replies, reactions, reports, settings, audit_logs) + RLS + RPCs iniciais.
2. `2026_06_05_communities_part4_media_and_approvals.sql` — mídia em tópicos + fila de aprovação.
3. `2026_06_05_communities_part6.sql` / `_part6_moderation.sql` — moderação consolidada (pin/lock/delete, papéis).
4. `2026_06_05_communities_part7_realtime.sql` — triggers de notificação.
5. `2026_06_05_communities_part8_insights.sql` — métricas/trending.
6. `2026_06_05_communities_part9.sql` — denúncias e ajustes RLS.
7. `2026_06_05_communities_part10.sql` — accent_color + customização.
8. `2026_06_05_communities_part11.sql` — convites por link.
9. `2026_06_05_communities_part12_notify_level.sql` — preferência de notificação por comunidade.
10. `2026_06_05_communities_part13_multi_reactions.sql` — múltiplos emojis (👍❤️🔥😂😮😢).
11. `2026_06_05_communities_part14_mentions.sql` — @menções com notificação.
12. `2026_06_05_communities_part15_channels.sql` — sub-canais por comunidade.
13. `2026_06_05_communities_part16_events.sql` — eventos com RSVP.
14. `2026_06_05_communities_part17_topic_polls.sql` — enquetes em tópicos.
15. `2026_06_05_communities_part18_badges.sql` — sistema de badges automáticos.
16. `2026_06_05_communities_part19_advanced_gate.sql` — convites direcionados + perguntas de portaria.
17. `2026_06_05_communities_part20_admin_global.sql` — admin global (CRUD categorias + audit logs).

## Cobertura por área

| Área | RPCs principais | Tabelas |
|---|---|---|
| Base & social | `community_create`, `community_join`, `community_leave`, `community_toggle_reaction` | communities, members, topics, replies |
| Moderação | `community_topic_moderate`, `community_reply_moderate`, `community_approve_member` | audit_logs, reports |
| Customização | `community_update_accent` | communities.accent_color |
| Convites | `community_invite_create`, `community_invite_user`, `community_invite_accept` | invites |
| Engajamento | `community_trending`, `community_my_reactions`, `community_set_notify_level` | reactions, members.notify_level |
| Menções | `_community_notify_mentions` (trigger) | notifications (type=community_mention) |
| Canais | `community_channel_*` | channels |
| Eventos | `community_event_*`, `event_rsvp_set` | events, event_rsvps |
| Enquetes | `community_topic_poll_*`, `community_topic_poll_vote` | topic_polls, topic_poll_votes |
| Badges | `community_badge_evaluate`, `community_badge_list` | badge_defs, user_badges |
| Portaria | `community_join_questions_set`, `community_join_with_answers`, `community_member_answers` | join_questions, join_answers |
| Admin global | `community_admin_category_*`, `community_admin_audit_logs` | categories.is_active |

## Reaproveitamento

- `oculto_is_master(uuid)` — bypass administrativo em todos os RPCs.
- `_community_can_moderate(_user, _community)` — helper compartilhado.
- `public.notifications` — canal único para todos os eventos (`type LIKE 'community_%'`).
- Bucket privado `community-media` + signed URL.

## Observações

- Todos os RPCs usam `SECURITY DEFINER SET search_path = public`.
- Todos os blocos terminam com `NOTIFY pgrst, 'reload schema';` para recarregar o PostgREST.
- Tabelas isoladas com prefixo `oculto_community_*` (zero acoplamento com o resto do schema).
