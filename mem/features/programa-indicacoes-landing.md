---
name: Página pública Programa de Indicações
description: Landing /programa-indicacoes editável no admin (tab "Página Pública"), explica Indicações Gerais, Afiliados de Canais, Madrinhas, Pioneiros, Ranking e Cupons. Persistida em landing_settings key=referrals_landing, realtime sync, deep-link por #anchor.
type: feature
---

Rota pública (sem auth): `/programa-indicacoes` em `src/pages/ProgramaIndicacoesPage.tsx`. Registrada no App.tsx logo após `/` (Landing), fora do bloco `<DashboardLayout>`. CTA "Começar a indicar" redireciona para `/signup` se não logado, `/indicacoes` se logado.

**Estrutura**: Hero → Como funciona (3 passos) → Programs Grid (cards com anchor id) → Tabela comparativa → Selos de confiança → FAQ (accordion) → CTA final.

**Conteúdo editável** via `useReferralsLandingContent` (key `referrals_landing` em `landing_settings`). `useUpdateReferralsLanding` faz upsert. Realtime invalida cache.

**Anchors** (deep-link a partir de "Saiba mais"): `#indicacoes-gerais`, `#afiliados-canais`, `#madrinhas`, `#pioneiros`, `#ranking`, `#cupons`. Cada card tem `scroll-mt-20`.

**Admin**: tab "Página Pública" adicionada em `/admin/programa-indicacoes` (`AdminProgramaIndicacoesPage`), componente `src/components/admin/ReferralsLandingEditor.tsx`. Toggle `published` global, editor de hero/passos/programas/tabela/selos/FAQ/CTA, reordenação com setas, confirmação via AlertDialog antes de publicar, botão "Restaurar conteúdo padrão".

**Cross-links "Saiba mais"** já adicionados em:
- `IndicacoesPage` (banner topo → `#indicacoes-gerais`)
- `AffiliatesPage` (botão header → `#afiliados-canais`)
- `MadrinhaAnalyticsPage` (botão header → `#madrinhas`)
- `PioneirosPage` (nav topo → `#pioneiros`)
- `AffiliateCampaignsStrip` (link inline "Ver todos os programas")

**Sitemap**: rota adicionada em `public/sitemap.xml` com priority 0.8.

**Sem migrations**: reusa `landing_settings` (JSONB). Sem mudanças em RLS, splits, RPCs financeiras ou regras de comissão — só camada de conteúdo.
