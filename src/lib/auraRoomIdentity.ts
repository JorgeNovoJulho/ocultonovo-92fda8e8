const AURA_ROOM_NAMESPACE = 'oculto-aura-room:';

function hexToUuid(hex: string) {
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function fallbackHash128(input: string) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < input.length; i += 1) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  const parts = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((part) => (part >>> 0).toString(16).padStart(8, '0'));

  return parts.join('');
}

async function hashRoomKey(roomKey: string) {
  if (typeof TextEncoder !== 'undefined' && globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(roomKey);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 32);
  }

  return fallbackHash128(roomKey);
}

export function normalizeAuraRoomSlug(slug?: string | null) {
  const normalized = slug?.trim().toLowerCase();
  return normalized ? normalized : null;
}

const roomIdCache = new Map<string, Promise<string>>();

export function getAuraRoomIdFromSlug(slug?: string | null): Promise<string | null> {
  const normalized = normalizeAuraRoomSlug(slug);
  if (!normalized) return Promise.resolve(null);

  const roomKey = `${AURA_ROOM_NAMESPACE}${normalized}`;
  if (!roomIdCache.has(roomKey)) {
    roomIdCache.set(roomKey, hashRoomKey(roomKey).then(hexToUuid));
  }

  return roomIdCache.get(roomKey)!.then((id) => id || null);
}