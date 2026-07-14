/**
 * Social Universe — score barrel.
 * Hooks legados continuam funcionando; prefira `useSocialIdentity` quando
 * precisar de score+prestige+trust juntos.
 */
export { useSocialScore } from '@/hooks/useSocialScore';
export type { SocialScore, SocialPerk } from '@/hooks/useSocialScore';
export { useSocialIdentity } from '@/hooks/useSocialIdentity';
export type { SocialIdentity } from '@/hooks/useSocialIdentity';
