/**
 * Mapeia chaves de seção (HomeSectionKey usadas em "Sessões Ocultas")
 * para os widget keys do sistema de Modos de Visualização do Feed.
 *
 * Assim, ativar/fechar um card em /sessoes-ocultas atua DIRETAMENTE
 * sobre os mesmos overrides que o dropdown "Modo de visualização" usa,
 * garantindo sincronia 100% em tempo real entre os dois painéis e o feed.
 */
import type { HomeSectionKey } from '@/config/homeSections';
import type { FeedWidgetKey } from './modes.config';

export const SECTION_TO_WIDGET: Partial<Record<HomeSectionKey, FeedWidgetKey>> = {
  smart_start:           'retentionBlock',
  stories:               'stories',
  active_matches:        'matches',
  recent_matches:        'matches',
  discover_universe:     'discoveryUniverse',
  referral_link:         'shareLink',
  vip_creators:          'vipCreators',
  hidden_rooms:          'hiddenRooms',
  events:                'events',
  mysterious_discovery:  'suggestionsInline',
  caixa_oculta:          'caixaOculta',
  feed_vivo:             'feedVivo',
  presence_pulse:        'presence',
  micro_tips:            'microTips',
  sponsored_ads:         'sponsoredAds',
  new_members:           'newMembers',
  communities_feed_card: 'communitiesFeedCard',
};
