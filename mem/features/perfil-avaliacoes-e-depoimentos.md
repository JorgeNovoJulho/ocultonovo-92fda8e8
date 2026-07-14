---
name: Profile Ratings & Testimonials
description: Star ratings (0-5), testimonials with hearts/replies, real recommendations, notepad integration via 3-dot menu
type: feature
---

# Profile Actions Menu + Avaliações + Depoimentos

3-dot menu ao lado do avatar no `CreatorProfilePage` com glow visual. Itens: Avaliar, Escrever depoimento, Recomendar como real, Enviar para bloco de notas, Bloquear, Denunciar, Feedback (sem favoritos).

## Tabelas (Supabase externo)
- `oculto_profile_ratings(rater_profile_id, target_profile_id, stars 1-5)` UNIQUE — trigger recalcula `profiles.rating_avg numeric(3,2)` + `rating_count int`
- `oculto_profile_testimonials(author_profile_id, target_profile_id, content<=250, reply, hearts, ...)` 
- `oculto_testimonial_hearts(testimonial_id, profile_id)` UNIQUE — trigger agrega `hearts`
- `oculto_real_recommendations(recommender_profile_id, target_profile_id)` UNIQUE

SQL idempotente em `supabase/external_sql/2026_05_27_profile_ratings_testimonials.sql` — rodar manualmente no SQL Editor.

## Frontend
- `ProfileActionsMenu` — botão glow + DropdownMenu
- `RateProfileModal` — 5 estrelas, upsert
- `ProfileRatingBadge` — exibe avg/count no header
- `ProfileTestimonialsSection` — lista + cards + hearts + reply (somente target) + delete + moderação
- `WriteTestimonialModal` — textarea zod max 250
- Hooks: `useProfileRating`, `useProfileTestimonials` (com realtime `testimonials:<targetId>`)

## Regras
- IDs sempre `profiles.id` (não `auth.users.id`)
- `getPublicHandle` para exibir `@username` — nunca nome real
- Bloqueio mútuo valida via trigger consultando `oculto_blocked_contacts`
- "Enviar para bloco" usa `useUserNotes.create({ title: '@handle', content: profileUrl })`
- "Recomendar como real" toggle direto em `oculto_real_recommendations`
