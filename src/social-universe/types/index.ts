/**
 * Social Universe — types & enums centralizados.
 * Fonte única para tipos compartilhados entre core, aura, feed, matchmaking,
 * rooms, prestige, score, realtime, analytics, premium, events.
 *
 * Não duplica tipos já fortemente acoplados a um domínio (ex.: Auction).
 * Acrescente aqui APENAS quando o tipo for usado por 2+ módulos.
 */

// --- Identidade -----------------------------------------------------------
export type UserId = string;
export type ProfileId = string;

export interface SocialIdentitySnapshot {
  user_id: UserId;
  score?: { level: number; xp: number; level_name: string; glow_color: string } | null;
  prestige?: { rank: number; name: string; glow_color: string; xp: number } | null;
  trust?: { score: number } | null;
  aura?: { level: number; xp: number; streak_days: number } | null;
}

// --- Energia / Magnetismo / Raridade --------------------------------------
export type EnergyLevel = 'idle' | 'warm' | 'rising' | 'storm' | 'apex';
export type MagnetismTier = 'low' | 'medium' | 'high' | 'extreme';
export type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';

export const ENERGY_THRESHOLDS: Record<EnergyLevel, number> = {
  idle: 0,
  warm: 25,
  rising: 50,
  storm: 75,
  apex: 90,
};

// --- Compatibilidade ------------------------------------------------------
export interface CompatibilitySignal {
  user_id: UserId;
  affinity: number;     // 0..100
  recency: number;      // segundos desde última interação
  proximity_km?: number;
  shared_tags?: string[];
  magnetism: MagnetismTier;
}

// --- Realtime events ------------------------------------------------------
export type SocialEventKind =
  | 'match'
  | 'follow'
  | 'social_notification'
  | 'aura_room_join'
  | 'aura_room_leave'
  | 'aura_storm'
  | 'feed_activity';

export interface SocialEvent<T = unknown> {
  kind: SocialEventKind;
  payload: T;
  ts: number;
}

// --- Rooms ---------------------------------------------------------------
export interface RoomSummary {
  slug: string;
  name: string;
  emoji?: string | null;
  energy: number;
  mood?: string | null;
  rising: boolean;
  presence: number;
}

// --- Prestige tiers (definidos via DB, este é o shape estável) ------------
export interface PrestigeTier {
  rank: number;
  name: string;
  badge_icon: string;
  glow_color: string;
  min_xp: number;
}
