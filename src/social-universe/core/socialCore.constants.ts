/**
 * Social Core Engine — constants
 * Defaults locais. Em produção, podem vir de `oculto_social_core_config`
 * via admin master (fallback aqui se RPC falhar).
 */
import type { SocialCoreConfig, RarityTier } from './socialCore.types';

export const SOCIAL_CORE_DEFAULTS: SocialCoreConfig = {
  weights: { aura: 0.30, prestige: 0.25, trust: 0.20, popularity: 0.15, magnetism: 0.10 },
  thresholds: { min_score_to_match: 0, min_trust_to_message: 20, shadowban_score: -30 },
  multipliers: { premium: 1.15, vip: 1.30 },
};

export const RARITY_ORDER: RarityTier[] = ['common', 'uncommon', 'rare', 'epic', 'mythic'];

export const RARITY_GLOW: Record<RarityTier, string> = {
  common:   '220 10% 60%',
  uncommon: '160 60% 50%',
  rare:     '210 90% 60%',
  epic:     '280 80% 65%',
  mythic:   '40 95% 60%',
};

export const TRUST_TIER_LABELS = {
  excellent: 'Excelente',
  good: 'Bom',
  regular: 'Regular',
  low: 'Baixo',
  critical: 'Crítico',
} as const;

export const SOCIAL_IDENTITY_QUERY_KEY = 'social-core-identity';
export const SOCIAL_CORE_STALE_TIME = 60_000;
