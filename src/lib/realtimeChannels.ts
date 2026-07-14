/**
 * Constantes de nomes de canais Realtime — Onda A.
 * Use SEMPRE estes helpers ao criar canais para evitar nomes instáveis
 * (proibido `${Date.now()}` no nome do canal — vaza websocket).
 */
export const realtimeChannel = {
  social: (userId: string) => `social:${userId}`,
  matches: (userId: string) => `matches:${userId}`,
  presence: (userId: string) => `presence:${userId}`,
  auraRoomChat: (slug: string) => `aura_room_chat:${slug}`,
  auraRoom: (slug: string) => `aura_room:${slug}`,
  notifications: (userId: string) => `notifications:${userId}`,
  onlineCount: () => `online-count-watch`,
} as const;
