/**
 * Social Universe — entry point único.
 * Importe daqui para ter acesso ao núcleo, hooks, types e constants.
 *
 *   import { useSocialUniverse, useSocialIdentity } from '@/social-universe';
 *
 * NÃO mova páginas/componentes grandes ainda (Onda C).
 */
export * from './core/SocialUniverseProvider';
export * from './types';
export * from './constants';

// --- Social Core Engine (Prioridade 1) ---
export { useSocialCore } from './core/useSocialCore';
export { fetchSocialIdentity, recalculateTrust } from './core/socialCore.service';
export {
  SOCIAL_CORE_DEFAULTS,
  RARITY_ORDER,
  RARITY_GLOW,
  TRUST_TIER_LABELS,
  SOCIAL_IDENTITY_QUERY_KEY,
} from './core/socialCore.constants';
export type {
  SocialIdentityFull,
  SocialCoreConfig,
  RarityTier,
  MagnetismSnapshot,
  PopularitySnapshot,
  CompatibilitySignals,
  ReputationFlags,
} from './core/socialCore.types';

export * as Realtime from './realtime';
export * as Score from './score';
export * as Prestige from './prestige';
export * as Aura from './aura';
export * as Rooms from './rooms';
export * as Matchmaking from './matchmaking';
export * as Feed from './feed';
export * as Premium from './premium';
export * as Events from './events';

// --- Onda C ---
export * as Nights from './nights';
export * as Seasons from './seasons';
export * as Destiny from './destiny';
export * as Magnetism from './magnetism';
export * as VipPass from './vip-pass';
export * as HiddenConnections from './hidden-connections';
export type { DestinyLink, DestinyRarity } from './destiny';
export type { HiddenConnection } from './hidden-connections';
export type { NoiteOculta } from './nights';
export type { SeasonCurrent, SeasonProgress, SeasonTopRow } from './seasons';
export type { MagneticStatus } from './magnetism';
export type { VipPassStatus, VipPassTier } from './vip-pass';
export type { RealExperience } from './real-experiences';
export * as RealExperiences from './real-experiences';

export { useNoiteOculta } from './nights';
export { useSocialSeason, useSeasonTop } from './seasons';
export { useDestinoSocial, destinyRegisterEncounter } from './destiny';
export { useMagneticEnergy } from './magnetism';
export { useVipSocialPass } from './vip-pass';
export { useConexoesOcultas } from './hidden-connections';
export { useExperienciasReais, useRsvpExperiencia } from './real-experiences';
export { useFeedVivo } from './feed/useFeedVivo';
export type { FeedVivoItem } from './feed/useFeedVivo';

export { useSocialAnalytics } from './analytics/useSocialAnalytics';
export type { SocialAnalyticsSnapshot } from './analytics/useSocialAnalytics';

// --- Prioridade 2 — Presença Invisível ---
export { usePresenceSignals, emitPresenceSignal, PRESENCE_COPY } from './presence';
export type { PresenceSignal, PresenceSignalType } from './presence';

// --- Prioridade 4 — IA Social (regras explicáveis) ---
export { useSocialAiSuggestions, trackSocialAi } from './ai';
export type { SocialAiSuggestion } from './ai';

// --- Prioridade 5 — Economia Social Premium ---
export * as Economy from './economy';
export {
  useSocialEconomyCatalog,
  useMySocialEconomyMetrics,
  checkCanPurchase,
  createSocialEconomyPurchase,
} from './economy';
export type { SocialEconomyProduct } from './economy';
