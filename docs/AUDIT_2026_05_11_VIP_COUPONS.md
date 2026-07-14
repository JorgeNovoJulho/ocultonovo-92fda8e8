# Auditoria — Fix RGB Glow + Promoções, Eventos e Cupons no Canal VIP
**Data:** 2026-05-11

## Etapa 1 — Fix RGB no carrossel "Explorar Criadores VIP"
- `src/index.css`: `.highlight-glow-rgb` reescrito para não depender de `inset` negativo (`Card overflow-hidden` recortava o anel rotativo). O ring agora ocupa `inset:0 / padding:2px` e o halo difuso é `box-shadow` na própria classe. Fica visível mesmo com `overflow:hidden` no ancestral.
- `src/components/feed/VipCreatorsCarousel.tsx`:
  - `useVipCreators` passou a `select` `highlight_glow_style` em `profiles`.
  - `VipCreatorCard` lê `creator.highlight_glow_style` para qualquer card; o card próprio continua usando preferência local em tempo real (`useHighlightGlow`).
  - Resultado: RGB agora aparece nos cards destacados de outros criadores que escolheram esse estilo no menu de destaque.

## Etapa 2 — Eventos do Canal funcional
- Removida a regra `sec.key !== "events"` que bloqueava o tile.
- Tile "Criar evento" agora abre o `CreateEventModal` (mesmo modal usado no menu lateral).
- Após fechar o modal, `refreshChannel()` invalida o cache do canal.

## Etapa 3 — Seção "Promoções"
- Adicionado `SectionKey="promo"` em `SECTION_DEFS` (ícone Tag rosa).
- `categorize()` direciona qualquer post com `is_promo=true` ou `section_type='promo'` para a seção.
- `AddPaidContentModal` ganhou prop `promoMode` que marca `is_promo=true`, grava `promo_price` e permite `priceNum=0` (gratuito) sem travar o cadeado.
- SQL adicionou colunas `is_promo`, `promo_price`, `promo_starts_at`, `promo_ends_at` em `posts` (idempotente).

## Etapa 4 — Sistema completo de Cupons
**Banco (`supabase/external_sql/2026_05_11_creator_coupons.sql`):**
- `oculto_creator_coupons` (creator_id, code, discount_percent 1–90, applies_to text[], valid_from/until, max_uses, uses_count, is_active, posted_to_feed, timestamps).
- `oculto_coupon_redemptions` com UNIQUE `(coupon_id, user_id)` → garante 1 uso por usuário.
- RLS: leitura pública dos cupons; CRUD restrito ao `creator_id = auth.uid()`; redemptions visíveis ao dono do cupom e ao próprio usuário.
- RPC `redeem_coupon(code, creator, target_type, target_id, amount)`: SECURITY DEFINER, valida vigência, ativo, esgotado, applies_to, unicidade e incrementa `uses_count` atomicamente.
- RPC `creator_coupon_analytics(creator)`: agregados de 90 dias por dia e por tipo.

**UI:**
- `CreatorCouponsPanel` (sidebar do canal, dono): lista de cupons com status (Ativo/Pausado/Expirado/Esgotado/Agendado), barra de uso, ações Pausar/Reativar, Editar (apenas se inativo), Postar no feed.
- `CreateCouponModal` com validação Zod (code regex, percent 1–90, datas coerentes, applies_to mínimo 1).
- `CouponAnalyticsCard` com Recharts (resgates/dia + total economizado).
- `PublicCouponsList` (sidebar do canal, visitantes/assinantes): lista cupons ativos, copia código, mostra restante e validade.
- `src/lib/coupons.ts`: helper `redeemCoupon()` + dicionário `COUPON_REASON_LABEL`.

**Postagem no feed:**
- Botão "Feed" no painel insere `posts` com `kind='coupon'`/`coupon_id` referenciando o cupom + marca `posted_to_feed=true`. (RealFeed pode renderizar via `kind='coupon'` em iteração futura.)

## Status final
| Item | Status |
|------|--------|
| RGB glow visível em qualquer card destacado | ✅ |
| Eventos do Canal abrem modal existente | ✅ |
| Promoções (vídeos/fotos/packs com preço promo/grátis) | ✅ |
| Cupons CRUD + analytics + post feed + listagem pública | ✅ |
| Redenção única por usuário (DB-enforced) | ✅ |
| RLS coberta para criador e usuários | ✅ |

## Pendências futuras (fora do escopo agora)
- Renderização visual do `kind='coupon'` em `RealFeed.tsx` (CouponFeedCard).
- Plug-in de `redeemCoupon()` nos modais de checkout (assinatura mensal/anual, PaidContentCheckout, SuperDM) — base já está pronta no helper.
