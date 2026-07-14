/**
 * SlotSpecificContent — roteia o conteúdo real para cada sub-área do Social Beta.
 */
import type { SocialBetaSlot } from '@/hooks/useSocialBetaVisit';
import { LoungeContent } from './LoungeContent';
import { ConnectionsContent } from './ConnectionsContent';
import { GamesContent } from './GamesContent';
import { DynamicsContent } from './DynamicsContent';

export function SlotSpecificContent({ slot }: { slot: Exclude<SocialBetaSlot, 'hub'> }) {
  switch (slot) {
    case 'lounge':      return <LoungeContent />;
    case 'connections': return <ConnectionsContent />;
    case 'games':       return <GamesContent />;
    case 'dynamics':    return <DynamicsContent />;
    default:            return null;
  }
}
