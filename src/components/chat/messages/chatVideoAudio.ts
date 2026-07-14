import type { ChatVideoAudioState } from './types';

export const CHAT_VIDEO_AUDIO_STORAGE_KEY = 'oculto-chat-video-audio-state';

export const normalizeChatVideoAudioState = (
  state?: Partial<ChatVideoAudioState> | null,
): ChatVideoAudioState => {
  const volume =
    typeof state?.volume === 'number' ? Math.min(1, Math.max(0.05, state.volume)) : 1;
  return {
    muted: typeof state?.muted === 'boolean' ? state.muted : false,
    volume,
  };
};

export const readChatVideoAudioState = (): ChatVideoAudioState => {
  if (typeof window === 'undefined') return { muted: false, volume: 1 };
  try {
    const raw =
      window.localStorage.getItem(CHAT_VIDEO_AUDIO_STORAGE_KEY) ??
      window.sessionStorage.getItem(CHAT_VIDEO_AUDIO_STORAGE_KEY);
    if (!raw) return { muted: false, volume: 1 };
    return normalizeChatVideoAudioState(JSON.parse(raw));
  } catch {
    return { muted: false, volume: 1 };
  }
};

// Module-level singleton: shared across all <ChatVideoPlayer /> instances
let currentState: ChatVideoAudioState = readChatVideoAudioState();

export const getChatVideoAudioState = (): ChatVideoAudioState => currentState;

export const setChatVideoAudioState = (next: ChatVideoAudioState): ChatVideoAudioState => {
  const normalized = normalizeChatVideoAudioState(next);
  currentState = normalized;
  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(normalized);
      window.localStorage.setItem(CHAT_VIDEO_AUDIO_STORAGE_KEY, serialized);
      window.sessionStorage.setItem(CHAT_VIDEO_AUDIO_STORAGE_KEY, serialized);
    } catch {
      // ignore storage failures
    }
  }
  return normalized;
};
