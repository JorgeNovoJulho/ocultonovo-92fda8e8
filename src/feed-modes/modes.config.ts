/**
 * Modos de Visualização do Feed — definição de quais widgets cada modo mostra.
 * Editar aqui é seguro: o RealFeed lê via `shows(key)` do FeedModeProvider.
 */

export type FeedModeId = 'completo' | 'social' | 'descoberta' | 'limpo' | 'card' | 'personalizado';

/** Chaves dos blocos do feed que podem ser ligados/desligados por modo. */
export type FeedWidgetKey =
  | 'newMembers'
  | 'noiteOculta'
  | 'retentionBlock'
  | 'microTips'
  | 'earnByReferral'
  | 'affiliateCampaigns'
  | 'feedVivo'
  | 'presence'
  | 'caixaOculta'
  | 'experienciasReais'
  | 'sponsoredAds'
  | 'stories'
  | 'matches'
  | 'discoveryUniverse'
  | 'shareLink'
  | 'vipCreators'
  | 'hiddenRooms'
  | 'events'
  | 'socialAiHints'
  | 'suggestionsInline'
  | 'marketplaceInline'
  | 'communitiesTrending'
  | 'communitiesFeedCard';

/** Cada modo declara EXPLICITAMENTE quais widgets exibe. */
export const FEED_MODES: Record<FeedModeId, ReadonlySet<FeedWidgetKey>> = {
  completo: new Set<FeedWidgetKey>([
    'newMembers','noiteOculta','retentionBlock','microTips','earnByReferral',
    'affiliateCampaigns','feedVivo','presence','caixaOculta','experienciasReais',
    'sponsoredAds','stories','matches','discoveryUniverse','shareLink',
    'vipCreators','hiddenRooms','events','socialAiHints',
    'suggestionsInline','marketplaceInline','communitiesTrending','communitiesFeedCard',
  ]),

  social: new Set<FeedWidgetKey>([
    'newMembers','stories','matches','presence','feedVivo',
    'shareLink','suggestionsInline','communitiesTrending','communitiesFeedCard',
  ]),

  descoberta: new Set<FeedWidgetKey>([
    'discoveryUniverse','vipCreators','hiddenRooms','matches','socialAiHints',
    'experienciasReais','events','suggestionsInline','communitiesTrending','communitiesFeedCard',
  ]),

  limpo: new Set<FeedWidgetKey>([
    // Visualização limpa: essencial + boas-vindas + stories + Salas Ocultas
    // por padrão. Salas Ocultas só some quando o usuário desliga no modo
    // Personalizado. "Explorar novos misteriosos(as)" sempre aparece.
    'newMembers',
    'stories',
    'hiddenRooms',
    'communitiesFeedCard',
  ]),



  card: new Set<FeedWidgetKey>([
    // grade de cards: mantém só o essencial
    'stories',
  ]),

  // 'personalizado' começa idêntico ao completo; o usuário pode desativar
  // widgets pelo painel — overrides ficam em profiles.feed_widgets_custom.
  personalizado: new Set<FeedWidgetKey>([
    'newMembers','noiteOculta','retentionBlock','microTips','earnByReferral',
    'affiliateCampaigns','feedVivo','presence','caixaOculta','experienciasReais',
    'sponsoredAds','stories','matches','discoveryUniverse','shareLink',
    'vipCreators','hiddenRooms','events','socialAiHints',
    'suggestionsInline','marketplaceInline','communitiesTrending','communitiesFeedCard',
  ]),
};

/** Modos que FORÇAM a aba 'card' no FeedTabs. */
export const MODES_FORCING_CARD: ReadonlySet<FeedModeId> = new Set(['card']);

export const DEFAULT_FEED_MODE: FeedModeId = 'limpo';

/** Rótulos amigáveis para o painel do modo Personalizado. */
export const FEED_WIDGET_LABELS: Record<FeedWidgetKey, { label: string; description: string }> = {
  newMembers:         { label: 'Boas-vindas',            description: 'Quem entrou recentemente na plataforma' },
  noiteOculta:        { label: 'Noite Oculta',           description: 'Tema da noite e ritual em andamento' },
  retentionBlock:     { label: 'Convites & retenção',    description: 'Sugestões para te manter ativo' },
  microTips:          { label: 'Micro-dicas',            description: 'Dicas curtas de uso da plataforma' },
  earnByReferral:     { label: 'Ganhe indicando',        description: 'Card de indicação rápida' },
  affiliateCampaigns: { label: 'Campanhas de afiliado',  description: 'Materiais e campanhas para divulgar' },
  feedVivo:           { label: 'Feed Vivo',              description: 'Pulsos sociais em tempo real' },
  presence:           { label: 'Presença invisível',     description: 'Pulsos anonimizados de quem está por perto' },
  caixaOculta:        { label: 'Caixa Oculta',           description: 'Recados e descobertas surpresa' },
  experienciasReais:  { label: 'Experiências reais',     description: 'Eventos e encontros validados' },
  sponsoredAds:       { label: 'Patrocinados',           description: 'Anúncios e campanhas oficiais' },
  stories:            { label: 'Stories',                description: 'Stories do feed' },
  matches:            { label: 'Matches',                description: 'Conexões e par ideal' },
  discoveryUniverse:  { label: 'Universo Oculto',        description: 'Radar, VIP e salas para descobrir' },
  shareLink:          { label: 'Compartilhar link',      description: 'Card para divulgar seu convite' },
  vipCreators:        { label: 'Criadores VIP',          description: 'Destaques de creators VIP' },
  hiddenRooms:        { label: 'Salas Ocultas',          description: 'Salas privadas e eventos exclusivos' },
  events:             { label: 'Eventos',                description: 'Próximos eventos VIP/Reais' },
  socialAiHints:      { label: 'IA Social',              description: 'Sugestões inteligentes baseadas em afinidade' },
  suggestionsInline:  { label: 'Sugestões inline',       description: 'Carrosséis "Misteriosos(as) para você"' },
  marketplaceInline:  { label: 'Marketplace inline',     description: 'Conteúdo do marketplace no meio do feed' },
  communitiesTrending:{ label: 'Comunidades em Alta',    description: 'Ranking semanal das comunidades mais ativas' },
  communitiesFeedCard:{ label: 'Comunidades Ocultas',    description: 'Card grande de uma comunidade aleatória com atalho para criar a sua' },
};
