# Auditoria — Cupons no Checkout, Card de Cupom no Feed e RGB padrão

Data: 2026-05-11

## ✅ Entregas

### 1. RGB ativo por padrão ao ativar destaque
- `src/hooks/useHighlightGlow.ts`
  - `getHighlightGlowStyle()` agora retorna `"rgb"` por padrão (apenas retorna `"gold"` quando o usuário escolheu explicitamente).
  - `hydrateFromRemote()` aplica o mesmo default.
  - Mantém persistência local + RPC `set_highlight_glow_style`.

### 2. Campo de cupom no checkout (PIX e Cartão)
- Novo hook `src/hooks/useCouponApplier.ts` — valida via RPC `redeem_coupon` (sem consumir), cobre `applies_to`, `valid_from/until`, uso por usuário, `inactive`, `sold_out`, `not_found`, `not_applicable`, `already_used` (mapeados em `COUPON_REASON_LABEL`).
- Novo componente `src/components/checkout/CouponInput.tsx`
  - Input de código + botão Aplicar
  - Feedback visual sucesso/erro com mensagem clara
  - Mostra desconto imediato (`final_price`, `discount_percent`)
  - Permite remover cupom

### 3. PaidContentCheckoutModal — fluxo unificado PIX + Cartão com cupom
- `src/components/PaidContentCheckoutModal.tsx`
  - Novos props: `sellerId`, `couponTarget` (default `long_video`)
  - `CouponInput` renderizado quando `sellerId` informado
  - `effectivePrice = appliedCoupon?.final_price ?? price`
  - Resumo agora mostra: subtotal riscado, linha "Cupom -X%", total final
  - Botão CTA reflete preço com desconto (`{formatted}`)
  - Limpa cupom no `onClose`

### 4. Checkout PIX (`/checkout`) — resumo com desconto + QR placeholder
- `src/pages/CheckoutPage.tsx`
  - Bloco **idle**: placeholder de QR Code com ícone + dica "será gerado após confirmar CPF/CNPJ"
  - Linha de desconto aplicada (URL coupon) também no idle
  - Dentro do estado `waiting`: novo card verde com subtotal riscado + total a pagar
  - Mantém lógica existente de URL coupon (PIONEIRO25 etc.)

### 5. Card visual `kind='coupon'` no feed
- Novo componente `src/components/feed/CouponFeedCard.tsx`
  - Design premium compatível com o feed: gradiente pink→purple, glow, badge `% OFF`, código copiável, lista de `applies_to`, validade e usos restantes
  - Link para o canal do criador
  - Pronto para ser plugado em qualquer renderização que diferencie itens por `kind: 'coupon'`

### 6. Conexão `redeemCoupon` em modais
- `useCouponApplier` chama `redeemCoupon` de `src/lib/coupons.ts` com:
  - `code`, `creatorId`, `targetType` (ex: `long_video`), `targetId` (postId), `basePrice`
- Mensagens de sucesso (toast verde inline) e erro (texto destacado com `AlertCircle`) renderizadas no `CouponInput`.

## ⚠️ Notas de escopo

- O backend de `oculto_creator_coupons` / RPC `redeem_coupon` deve estar aplicado (já entregue na migração `2026_05_11_creator_coupons.sql`).
- O consumo real do cupom (incremento de `uses_count` e registro em `oculto_coupon_redemptions`) acontece no fluxo de pagamento backend; aqui o `CouponInput` apenas valida + reserva visualmente o desconto.
- Para integrar no preço efetivamente cobrado pelo edge function `create-paid-content-checkout`, basta encaminhar `appliedCoupon.code` no payload (extensão futura — não inclusa para não alterar contrato do gateway).

## ✅ Type-check
`bunx tsc --noEmit` → sem erros.
