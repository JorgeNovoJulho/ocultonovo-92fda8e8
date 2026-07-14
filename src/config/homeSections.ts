/**
 * Configuração central das seções da Home dos Modos de Visualização.
 * Independente do FEED_MODES legado (que continua funcionando).
 *
 * Esta config alimenta:
 *  - useViewModePreferences (hook)
 *  - CustomizeHomeSectionsModal (UI de personalização)
 *  - próxima etapa: integração no RealFeed via isSectionEnabled()
 */

export type HomeViewMode = 'simple' | 'custom' | 'complete';

export type HomeSectionKey =
  | 'smart_start'
  | 'stories'
  | 'active_matches'
  | 'discover_universe'
  | 'referral_link'
  | 'vip_creators'
  | 'hidden_rooms'
  | 'events'
  | 'mysterious_discovery'
  | 'communities_feed_card'
  | 'auctions'
  | 'right_chat'
  | 'caixa_oculta'
  | 'feed_vivo'
  | 'presence_pulse'
  | 'micro_tips'
  | 'sponsored_ads'
  | 'recent_matches'
  | 'new_members'
  | 'communities_trending'
  | 'modo_card';

export interface HomeSectionConfig {
  key: HomeSectionKey;
  label: string;
  description: string;
  defaultSimple: boolean;
  defaultComplete: boolean;
  hiddenSessions: boolean;
  heavy?: boolean;
  guideKey?: string;
}

export const HOME_SECTIONS: HomeSectionConfig[] = [
  { key: 'smart_start',          label: 'Início Inteligente',          description: 'Missões, retorno inteligente, ciclos sociais e dicas para começar melhor.',  defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'smart_start' },
  { key: 'stories',              label: 'Stories',                     description: 'Atualizações rápidas de usuários e criadores.',                                defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'stories' },
  { key: 'active_matches',       label: 'Matches Ativos',              description: 'Conexões recentes e pessoas compatíveis com você.',                            defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'active_matches' },
  { key: 'discover_universe',    label: 'Descubra o Universo Oculto',  description: 'Cards e chamadas especiais para explorar o universo social da plataforma.',    defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'discover_universe' },
  { key: 'referral_link',        label: 'Meu Link de Indicação',       description: 'Compartilhe seu link e acompanhe seus indicados.',                              defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: false, guideKey: 'referral_link' },
  { key: 'vip_creators',         label: 'Explorar Criadores VIP',      description: 'Canais, conteúdos e criadores em destaque.',                                    defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'vip_creators' },
  { key: 'hidden_rooms',         label: 'Salas Ocultas',               description: 'Salas, lounges e experiências sociais ao vivo.',                                defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'hidden_rooms' },
  { key: 'events',               label: 'Eventos',                     description: 'Eventos e experiências publicadas na plataforma.',                              defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'events' },
  { key: 'mysterious_discovery', label: 'Explorar Novos Misteriosos',  description: 'Cards de descoberta para encontrar novos perfis.',                              defaultSimple: true,  defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'mysterious_discovery' },
  { key: 'communities_feed_card', label: 'Comunidades Ocultas',        description: 'Card grande com uma comunidade aleatória e atalhos para entrar ou criar a sua.', defaultSimple: true,  defaultComplete: true, hiddenSessions: true,  heavy: false, guideKey: 'communities_feed_card' },
  { key: 'auctions',             label: 'Leilões',                     description: 'Leilões e disputas disponíveis na plataforma.',                                 defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'auctions' },
  { key: 'right_chat',           label: 'Chat Lateral',                description: 'Chat lateral em tempo real no desktop.',                                        defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'right_chat' },
  { key: 'caixa_oculta',         label: 'Caixa Oculta',                description: 'Campanhas com participação por XP, aprovadas pelo Admin Master.',               defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'caixa_oculta' },
  { key: 'feed_vivo',            label: 'Feed Vivo',                   description: 'Sinais sociais e atualizações dinâmicas do universo Oculto.',                   defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'feed_vivo' },
  { key: 'presence_pulse',       label: 'Pulso de Presença',           description: 'Indicações sociais de presença e movimento na plataforma.',                     defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'presence_pulse' },
  { key: 'micro_tips',           label: 'Dicas Rápidas',               description: 'Pequenas orientações para melhorar sua experiência.',                           defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: false, guideKey: 'micro_tips' },
  { key: 'sponsored_ads',        label: 'Destaques Patrocinados',      description: 'Cards promocionais e destaques da plataforma.',                                 defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'sponsored_ads' },
  { key: 'recent_matches',       label: 'Matches Recentes',            description: 'Conexões e compatibilidades recentes.',                                         defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'recent_matches' },
  { key: 'new_members',          label: 'Novos Misteriosos',           description: 'Novos perfis que chegaram ao Oculto.',                                          defaultSimple: true,  defaultComplete: true, hiddenSessions: true,  heavy: true,  guideKey: 'new_members' },
  { key: 'communities_trending', label: 'Comunidades em Alta',         description: 'Ranking semanal das comunidades mais ativas (Comunidades Ocultas).',           defaultSimple: false, defaultComplete: true, hiddenSessions: true,  heavy: false, guideKey: 'communities_trending' },
  { key: 'modo_card',            label: 'Modo Card',                   description: 'Visualização em grid para navegar pelos posts de forma rápida.',                defaultSimple: true,  defaultComplete: true, hiddenSessions: false, heavy: false, guideKey: 'modo_card' },
];

/** Seções que NUNCA podem ser desligadas mesmo no modo customizado. */
export const ALWAYS_ON_SECTIONS: ReadonlySet<HomeSectionKey> = new Set(['modo_card']);

export const DEFAULT_SIMPLE_SECTIONS: Record<HomeSectionKey, boolean> = HOME_SECTIONS.reduce((acc, s) => {
  acc[s.key] = s.defaultSimple;
  return acc;
}, {} as Record<HomeSectionKey, boolean>);

export const DEFAULT_COMPLETE_SECTIONS: Record<HomeSectionKey, boolean> = HOME_SECTIONS.reduce((acc, s) => {
  acc[s.key] = s.defaultComplete;
  return acc;
}, {} as Record<HomeSectionKey, boolean>);

export function getSectionByKey(key: string): HomeSectionConfig | undefined {
  return HOME_SECTIONS.find((s) => s.key === key);
}
