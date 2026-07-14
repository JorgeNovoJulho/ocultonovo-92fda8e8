/**
 * Banner padrão do perfil — usado quando o usuário ainda não fez upload de capa.
 * O arquivo vive em /public para ser servido como asset estático.
 */
export const DEFAULT_BANNER_URL = "/default-banner.jpg";

/**
 * Retorna a URL do banner com cache-bust quando aplicável, ou cai no padrão.
 */
export function resolveBannerUrl(
  coverUrl?: string | null,
  updatedAt?: string | null,
  previewUrl?: string | null,
): string {
  if (previewUrl) return previewUrl;
  if (coverUrl && coverUrl.trim().length > 0) {
    return updatedAt
      ? `${coverUrl}?v=${encodeURIComponent(updatedAt)}`
      : coverUrl;
  }
  return DEFAULT_BANNER_URL;
}
