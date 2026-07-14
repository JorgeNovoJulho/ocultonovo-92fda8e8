import type { Conversation } from '@/hooks/useChat';

export type ChatTargetProfile = Partial<Conversation['participants'][number]['profile']> & {
  id: string;
  user_id: string;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
};

export type ChatTimestampMode = 'time' | 'datetime';
export type ChatVideoAudioState = { muted: boolean; volume: number };
