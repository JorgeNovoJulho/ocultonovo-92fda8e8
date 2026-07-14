/**
 * profileImageCache — cache de URL de avatar/banner por usuário em localStorage,
 * com TTL e versionamento para hidratar a UI instantaneamente no primeiro render
 * (perfil próprio + cabeçalho do feed) sem esperar o round-trip do banco.
 *
 * Não armazena dados de negócio — apenas URLs públicas já presentes em `profiles`.
 */

const PREFIX = 'oculto:pimg:v3:';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface ProfileImageCacheEntry {
  avatar_url: string | null;
  banner_url: string | null;
  cover_image_url: string | null;
  // Identidade básica — também cacheada para hidratar @handle/nome no 1º render
  // sem esperar o round-trip do banco (evita "@bionca" piscar antes do real).
  username: string | null;
  display_name: string | null;
  name: string | null;
  updated_at: number;
  version: string;
}

const safeStorage = (): Storage | null => {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

const key = (userId: string) => `${PREFIX}${userId}`;

export function loadProfileImages(userId: string | null | undefined): ProfileImageCacheEntry | null {
  if (!userId) return null;
  const ls = safeStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfileImageCacheEntry;
    if (!parsed?.updated_at) return null;
    if (Date.now() - parsed.updated_at > TTL_MS) {
      ls.removeItem(key(userId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveProfileImages(
  userId: string | null | undefined,
  data: {
    avatar_url?: string | null;
    banner_url?: string | null;
    cover_image_url?: string | null;
    username?: string | null;
    display_name?: string | null;
    name?: string | null;
  },
) {
  if (!userId) return;
  const ls = safeStorage();
  if (!ls) return;
  try {
    // Merge com a entrada anterior — nunca apaga campo válido com null/undefined
    // (evita perder username em hidratação parcial pós-update).
    const prev = loadProfileImages(userId);
    const entry: ProfileImageCacheEntry = {
      avatar_url: data.avatar_url ?? prev?.avatar_url ?? null,
      banner_url: data.banner_url ?? prev?.banner_url ?? null,
      cover_image_url: data.cover_image_url ?? prev?.cover_image_url ?? null,
      username: data.username ?? prev?.username ?? null,
      display_name: data.display_name ?? prev?.display_name ?? null,
      name: data.name ?? prev?.name ?? null,
      updated_at: Date.now(),
      version: '3',
    };
    ls.setItem(key(userId), JSON.stringify(entry));
  } catch {
    /* quota / private mode — silencioso */
  }
}


export function invalidateProfileImages(userId: string | null | undefined) {
  if (!userId) return;
  const ls = safeStorage();
  if (!ls) return;
  try { ls.removeItem(key(userId)); } catch { /* noop */ }
}

/** Pré-carrega o avatar/banner no cache HTTP do browser para render imediato. */
export function warmupProfileImages(urls: Array<string | null | undefined>) {
  if (typeof window === 'undefined') return;
  urls.filter((u): u is string => !!u && /^https?:\/\//.test(u)).forEach((url) => {
    try {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = url;
    } catch { /* noop */ }
  });
}
