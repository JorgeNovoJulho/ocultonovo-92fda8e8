## O que vai mudar

Criar uma nova sessão no feed chamada **"Comunidades Ocultas"**, posicionada logo abaixo de **"Mistérios em Destaque"**, exibindo uma comunidade aleatória em um card grande roxo com botões **Entrar** e **Criar Comunidade**. Além disso, ajustar a regra de criação para liberar usuários gratuitos durante o beta e congelar comunidades de free quando o beta terminar.

## Frontend

### 1. Registrar a seção no sistema de Modos de Visualização
**`src/config/homeSections.ts`**
- Adicionar `'communities_feed_card'` em `HomeSectionKey`.
- Adicionar `HOME_SECTIONS` entre `mysterious_discovery` e `auctions` (label "Comunidades Ocultas", description "Card de uma comunidade aleatória com atalho para entrar ou criar uma nova.", defaults `true` simple e complete, `hiddenSessions: true`).

**`src/feed-modes/modes.config.ts`**
- Adicionar `'communitiesFeedCard'` em `FeedWidgetKey`.
- Incluir nos modos `completo`, `social`, `descoberta`, `limpo`, `personalizado`.
- Adicionar em `FEED_WIDGET_LABELS` (`'Comunidades Ocultas'` / "Card grande com uma comunidade aleatória e atalho para criar a sua").

**`src/feed-modes/hiddenSectionMap.ts`**
- Mapear `communities_feed_card: 'communitiesFeedCard'` para sincronizar com "Sessões Ocultas".

**`src/components/RealFeed.tsx`**
- Adicionar `communitiesFeedCard: 'communities_feed_card'` no map em ~linha 153.

### 2. Novo componente do card no feed
**`src/components/feed/CommunitiesOcultasFeedSection.tsx`** (novo)
- Busca via `useCommunities()` filtrando `status='active'`, escolhe **uma aleatória** por render (sorteio estável com `useMemo` + reseed quando muda a lista).
- Visual idêntico ao `CommunityCard` da imagem (capa, badge "Pública/Premium/VIP/+18", avatar, título, descrição, contadores de membros/tópicos/última atividade, avatares de membros recentes), porém:
  - Card **grande, destacado**, full-width no feed, com **preenchimento roxo** (`bg-purple-700` / gradient `from-purple-700 to-purple-900`), borda `border-purple-400/40`, textos em contraste branco/roxo claro.
  - Header com chip "Comunidades Ocultas" e ícone `Users2`.
  - **Dois botões grandes** lado a lado:
    - **Entrar** — `bg-white text-purple-900 hover:bg-purple-50`: usa `useJoinCommunity(id)`; se já membro, vira "Abrir" e navega para `/comunidades/:slug`; se privada, mostra "Solicitar".
    - **Criar Comunidade** — `bg-fuchsia-500 text-white`: navega para `/comunidades?create=1`.
- Estados: loading skeleton roxo; vazio (sem comunidades) → CTA único "Criar a primeira comunidade".

### 3. Injetar a seção no feed abaixo de "Mistérios em Destaque"
**`src/components/feed/FeedItem.tsx`**
- Aceitar prop nova `showCommunitiesFeedCard?: boolean`.
- Renderizar `<CommunitiesOcultasFeedSection />` logo após o bloco de Mistérios (mesma posição fixa, index 5+1 — definir `COMMUNITIES_FEED_FIXED_INDEX = 6`).

**`src/components/RealFeed.tsx`**
- Passar `showCommunitiesFeedCard={sectionEnabledForMode('communities_feed_card')}` para `<FeedItem />` em ~linha 1391.

### 4. Abrir modal de criação automaticamente em `/comunidades?create=1`
**`src/pages/CommunitiesPage.tsx`**
- Ler `useSearchParams()`; se `create=1`, setar `showCreateModal` true no mount e limpar o param.
- Antes de abrir, validar `useCanCreateCommunity()`: se `allowed=false` mostrar `CommunityCreateGateModal`; senão abrir `CreateCommunityModal`.

### 5. Liberar criação Free durante o beta + congelamento pós-beta
**`src/components/communities/CommunityCreateGateModal.tsx`**
- Adicionar novo `reason='frozen_post_beta'`: copy "Sua comunidade foi congelada. Para reativar e editar, assine Premium ou VIP." + CTA "Ver planos".

**`src/pages/CommunityDetailPage.tsx`** (ajuste leve)
- Se a comunidade tem `status='frozen'` e o viewer **não é dono Premium/VIP**, bloquear acesso e exibir banner "Comunidade congelada — aguardando reativação pelo dono".
- Se o viewer é **o dono e está Free**, exibir o `CommunityCreateGateModal` com `reason='frozen_post_beta'`.
- O card continua visível em `/comunidades` (apenas leitura), mas o botão "Entrar/Abrir" mostra toast "Comunidade congelada".

## Backend (SQL no chat para o usuário rodar)

Migration idempotente **`supabase/external_sql/2026_06_05_communities_beta_freeze.sql`**:

1. **`community_can_create`**: incluir caminho de beta — quando `oculto_platform_runtime.platform_mode='beta'` e `beta_enabled=true`, FREE pode criar até 1 comunidade independente de `allow_free_create`.
2. **Novo status `'frozen'`** permitido em `oculto_communities.status` (sem CHECK — apenas convenção).
3. **Nova função `community_freeze_free_owners_if_beta_ended()`** (master/cron): para cada comunidade cujo `owner` esteja com `plan_type='free'` e `platform_mode!='beta'`, setar `status='frozen'`. Idempotente.
4. **RLS update** em `occ_communities_read`: comunidades `frozen` continuam **visíveis** (SELECT permitido).
5. **RLS write/topics/replies**: bloquear INSERT/UPDATE quando `community.status='frozen'` (exceto se o user atual é dono e Premium/VIP — caso em que a função `community_reactivate(_id)` muda status para `active`).
6. **Nova RPC `community_reactivate(_id UUID)`**: dono Premium/VIP volta `status` para `active`; falha caso contrário.

O SQL completo será colado no chat (memory regra) para execução manual no SQL Editor externo.

## Sincronia em tempo real

A seção respeita o `FeedModeProvider`: ligar/desligar em "Sessões Ocultas" ou no painel "Modo de Visualização → Personalizado" reflete imediatamente no feed (já coberto por `SECTION_TO_WIDGET`).

## Fora de escopo (não tocar)

- Lógica de moderação de tópicos/respostas existente.
- Visual do `CommunityCard` padrão dentro de `/comunidades`.
- Cron real para congelar — apenas a função SQL fica disponível; agendamento será feito quando o beta encerrar.
