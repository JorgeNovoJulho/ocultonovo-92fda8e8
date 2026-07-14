import { normalizePublicStorageUrl } from "@/lib/storageUrl";

/**
 * Detecção ÚNICA e canônica de avatar válido em todo o app.
 *
 * Trata como "sem foto" (retorna null):
 *  - undefined / null / string vazia / só espaços
 *  - literais "null" / "undefined" (vindos de joins/serializações antigas)
 *  - placeholder.svg (em qualquer parte da URL, qualquer caixa)
 *  - URLs inválidas que o normalizer rejeita
 *
 * Retorna a URL pública normalizada para o bucket `avatars` quando válida.
 *
 * IMPORTANTE: use SEMPRE este helper antes de:
 *   - exibir <img src=...> de avatar
 *   - decidir se um perfil "tem foto" para ordenação/contagem/visibilidade
 *   - mostrar fallbacks/inicial/CTA "Atualize sua foto"
 */
export function resolveAvatarUrl(avatarUrl?: string | null): string | null {
  if (avatarUrl == null) return null;
  const raw = String(avatarUrl).trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "none") return null;
  if (lower.includes("placeholder.svg")) return null;
  if (lower.includes("/placeholders/")) return null;

  const normalized = normalizePublicStorageUrl(raw, "avatars");
  if (!normalized) return null;

  const normLower = normalized.toLowerCase();
  if (normLower.includes("placeholder.svg")) return null;
  if (normLower.includes("/placeholders/")) return null;

  return normalized;
}

/** Açúcar booleano — `hasValidAvatar({ avatar_url })` */
export function hasValidAvatar(input?: string | null | { avatar_url?: string | null }): boolean {
  let url: string | null | undefined;
  if (input != null && typeof input === "object") url = input.avatar_url;
  else url = input as string | null | undefined;
  return resolveAvatarUrl(url) !== null;
}
