---
name: Comunidades Ocultas
description: Sistema social estilo Orkut completo — comunidades, tópicos, respostas aninhadas, múltiplas reações, menções, canais, eventos com RSVP, enquetes, badges, convites/portaria, painel admin global. Tabelas oculto_community_*, RPCs community_*, RLS por membership/role.
type: feature
---
**Rotas:** `/comunidades`, `/comunidades/:slug`, `/comunidades/:slug/topico/:topicId`, `/comunidades/convite/:token`, `/admin/comunidades` (master).

**Hooks (`src/hooks/useCommunities.tsx`):**
- Base: `useCommunities`, `useCommunityBySlug`, `useCommunityCategories`, `useCommunitySettings`, `useMyMembership`, `useCanCreateCommunity`, `useCreateCommunity`, `useJoinCommunity`, `useLeaveCommunity`.
- Tópicos/replies: `useCommunityTopics`, `useCommunityTopic`, `useCommunityReplies`, `useAuthorsBatch`, `useCreateTopic`, `useCreateReply` (parent_reply_id), `useToggleReaction` (multi-emoji), `useMyTopicReactions`, `useMyReplyReactions`.
- Moderação: `useModerateTopic` (pin/unpin/lock/unlock/delete/restore), `useModerateReply`, `useCommunityNotifications`, `useMarkCommunityNotificationsRead`, `useUpdateCommunityAccent`, `useCommunityTrending`, `usePendingMembersCount`.
- Avançado: `useCommunityChannels`, `useCommunityEvents`/`useEventRsvp`, `useTopicPoll`/`useVoteTopicPoll`, `useCommunityBadges`, `useCommunityInvites`, `useInviteUserToCommunity`, `useCommunityJoinQuestions`, `useSetCommunityJoinQuestions`, `useJoinCommunityWithAnswers`, `useCommunityMemberAnswers`.
- Outros: `useUploadCommunityMedia` (bucket privado `community-media` + signed URL), `useReportCommunityContent`, `slugify`.

**Tabelas (prefixo `oculto_community_*`):** categories (+ `is_active`), communities (+ `accent_color`), members (+ `notify_level`), topics, replies (`parent_reply_id`, máx 2 níveis), media, reactions (multi-emoji), reports, settings, audit_logs, channels, events, event_rsvps, topic_polls, topic_poll_votes, badge_defs, user_badges, invites (+ `target_user_id`), join_questions, join_answers. Notificações em `public.notifications` (`type LIKE 'community_%'`: reply, mention, member_approved, event_invite, badge, etc.).

**RPCs principais:** `community_create/join/leave`, `community_toggle_reaction`, `community_topic_moderate`, `community_reply_moderate`, `community_trending`, `community_approve_member`, `community_set_notify_level`, `community_channel_*`, `community_event_*`, `event_rsvp_set`, `community_topic_poll_*`, `community_badge_evaluate/list`, `community_invite_create/user/accept`, `community_join_questions_set`, `community_join_with_answers`, `community_member_answers`, `community_admin_category_upsert/delete/list`, `community_admin_audit_logs`. Helper `_community_can_moderate`. Trigger `_community_notify_reply` + `_community_notify_mentions`.

**Componentes:** `CreateCommunityModal`, `CreateTopicModal`, `ManageMembersModal`, `CommunityTrendingWidget`, `CommunityNotificationsBell`, `CommunityBadgesPanel`, `ManageJoinQuestionsModal`, `JoinQuestionsModal`, `AdminCommunityCategoriesCard`, `AdminCommunityAuditLogsCard`.

**Limites por plano (configuráveis em `oculto_community_settings`):** Free não cria; Premium/VIP até 5; Master bypass.

**Visibilidades:** public, private (aprovação), premium_only, vip_only, creator_exclusive.

**Mobile-first:** flat, sem shadows pesados; `Users2` no sidebar; staleTime 15-60s; indentação 24px com `CornerDownRight`.

**SQL externo:** ver `supabase/external_sql/_COMMUNITIES_MANIFEST.md` (parts base + 4 + 6..20, todos idempotentes).

**Reaproveitamento:** `oculto_is_master(uuid)` para bypass; `profiles` via `useAuthorsBatch`; tudo isolado em `oculto_community_*`.
