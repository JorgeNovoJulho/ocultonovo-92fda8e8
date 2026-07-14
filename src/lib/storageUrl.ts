/**
 * Build a Supabase Storage public URL by string concatenation.
 * Avoids the extra network call of `getPublicUrl()`.
 * Single-source URL: imported from appConfig (EXTERNAL_SUPABASE_URL).
 */
import { EXTERNAL_SUPABASE_URL as SUPABASE_URL } from '@/lib/appConfig';

const STORAGE_PUBLIC_MARKER = '/storage/v1/object/public/';
const KNOWN_BUCKETS = new Set(['avatars', 'post-media', 'profile-media', 'media', 'banners', 'site-assets', 'oculto-play-media']);

export function buildPublicUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export function normalizePublicStorageUrl(value?: string | null, fallbackBucket = 'avatars'): string | null {
  if (!value) return null;
  const clean = value.trim();
  if (!clean) return null;

  if (clean.startsWith('data:') || clean.startsWith('blob:')) return clean;

  const withoutQuery = clean.split('?')[0].split('#')[0];

  // 1) Se a URL contém o marker de Storage público (`/storage/v1/object/public/<bucket>/<path>`),
  //    SEMPRE reescrevemos para o host canônico do Supabase externo.
  //    Isto cobre URLs absolutas legadas como
  //    `https://www.ocultoswing.com.br/sb-proxy/storage/v1/object/public/avatars/...`
  //    que NÃO funcionam fora do domínio publicado (preview, custom domains, mobile WebView).
  const publicMarkerIndex = withoutQuery.indexOf(STORAGE_PUBLIC_MARKER);
  if (publicMarkerIndex >= 0) {
    const raw = withoutQuery.slice(publicMarkerIndex + STORAGE_PUBLIC_MARKER.length);
    const [bucket, ...rest] = raw.replace(/^\/+/, '').split('/');
    if (bucket && rest.length) {
      return buildPublicUrl(bucket, rest.join('/'));
    }
  }

  // 2) Demais URLs absolutas (CDNs externas etc.) passam direto.
  if (withoutQuery.startsWith('http://') || withoutQuery.startsWith('https://')) {
    return withoutQuery;
  }

  const normalized = withoutQuery.replace(/^\/+/, '');
  const [maybeBucket, ...rest] = normalized.split('/');

  if (KNOWN_BUCKETS.has(maybeBucket) && rest.length) {
    return buildPublicUrl(maybeBucket, rest.join('/'));
  }

  if (normalized.startsWith(`${fallbackBucket}/`)) {
    return buildPublicUrl(fallbackBucket, normalized.slice(fallbackBucket.length + 1));
  }

  return buildPublicUrl(fallbackBucket, normalized);
}

/** Build a cache-busted version for display only */
export function buildCacheBustUrl(bucket: string, path: string): string {
  return `${buildPublicUrl(bucket, path)}?t=${Date.now()}`;
}

/** Generate the standard upload path: {userId}/{timestamp}_{filename} */
export function buildUploadPath(userId: string, fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${userId}/${Date.now()}_${sanitized}`;
}
