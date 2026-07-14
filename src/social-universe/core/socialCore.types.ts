/**
 * Social Core Engine — types
 * Fonte única de verdade para a identidade social do Oculto.
 * Estende SocialIdentity (Onda A) com magnetismo, raridade, popularidade,
 * sinais de compatibilidade e flags reputacionais.
 */
import type { SocialScore } from '@/hooks/useSocialScore';
import type { PrestigeData } from '@/hooks/usePrestige';
import type { TrustData, AuraSnapshot } from '@/hooks/useSocialIdentity';

export type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';

export interface MagnetismSnapshot {
  active: boolean;
  multiplier: number;          // 1.0 - 3.0
  ends_at: string | null;
  source: string | null;
}

export interface PopularitySnapshot {
  attention_received_7d: number;
  attention_sent_7d: number;
  destiny_links: number;
  followers: number;
}

export interface CompatibilitySignals {
  rarity: RarityTier;          // raridade dominante das conexões
  best_affinity: number;       // 0-100
  total_links: number;
}

export interface ReputationFlags {
  trust_tier: 'critical' | 'low' | 'regular' | 'good' | 'excellent';
  is_verified: boolean;
  is_premium: boolean;
  is_vip: boolean;
  shadowbanned: boolean;
}

export interface SocialIdentityFull {
  user_id: string;
  // núcleo (Onda A)
  score: SocialScore | null;
  prestige: PrestigeData | null;
  trust: TrustData | null;
  aura: AuraSnapshot | null;
  // extensões (Prioridade 1)
  magnetism: MagnetismSnapshot | null;
  popularity: PopularitySnapshot | null;
  compatibility_signals: CompatibilitySignals | null;
  reputation_flags: ReputationFlags | null;
  updated_at: string;
}

export interface SocialCoreConfig {
  weights: {
    aura: number;
    prestige: number;
    trust: number;
    popularity: number;
    magnetism: number;
  };
  thresholds: {
    min_score_to_match: number;
    min_trust_to_message: number;
    shadowban_score: number;
  };
  multipliers: {
    premium: number;
    vip: number;
  };
}
