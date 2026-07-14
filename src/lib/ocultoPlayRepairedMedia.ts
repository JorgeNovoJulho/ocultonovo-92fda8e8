const REPAIRED_PLAY_MEDIA: Record<string, string> = {
  'bb7e908c-d492-4c01-a98c-4b082f6b03d9': '/oculto-play-repaired/bb7e908c-d492-4c01-a98c-4b082f6b03d9.mp4',
  '59312708-f390-4ecb-afa5-93460418c602': '/oculto-play-repaired/59312708-f390-4ecb-afa5-93460418c602.mp4',
};

export function resolveOcultoPlayMediaUrl(itemId?: string | null, mediaUrl?: string | null) {
  if (!itemId) return mediaUrl ?? null;
  return REPAIRED_PLAY_MEDIA[itemId] ?? mediaUrl ?? null;
}
