/**
 * Social Universe — realtime barrel.
 * Re-exporta o provider único e helpers de canal estável.
 */
export {
  SocialRealtimeProvider,
  useSocialRealtime,
} from '@/providers/SocialRealtimeProvider';
export { realtimeChannel } from '@/lib/realtimeChannels';
