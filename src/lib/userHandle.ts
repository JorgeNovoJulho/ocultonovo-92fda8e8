/**
 * Helpers de exibição de identidade pública.
 * Regra do projeto: SEMPRE mostrar o @username do usuário (nunca o nome real
 * `profiles.name`). Centralizado aqui para garantir consistência em toda a UI.
 *
 * IMPORTANTE: quando o perfil ainda está carregando (ou houve falha transitória
 * de auth), evitamos exibir um handle falso tipo "@usuario" — isso confunde o
 * usuário e parece um perfil errado. Usamos o sentinel "@…" (loading) e
 * exportamos `hasRealHandle()` para que consumidores possam renderizar
 * skeleton no lugar do texto.
 */

type AnyProfile = {
  username?: string | null;
  name?: string | null;
  display_name?: string | null;
  email?: string | null;
} | null | undefined;

/** Sentinel visual exibido enquanto o handle real ainda não chegou. */
export const LOADING_HANDLE = "@…";

function cleanUsername(raw?: string | null): string {
  return (raw || "").toString().trim().replace(/^@+/, "");
}

/**
 * `true` quando o perfil tem um @username real (não é fallback/loading).
 * Use para decidir entre exibir o texto OU um Skeleton.
 */
export function hasRealHandle(p: AnyProfile): boolean {
  return cleanUsername(p?.username).length > 0;
}

/**
 * Retorna o handle público com @ — ex.: "@mulatacuriosa_ofc".
 * Se não houver username, retorna o sentinel "@…" (loading) por padrão —
 * NUNCA usa nome real/email como fallback (preservando privacidade) e NUNCA
 * inventa um "@usuario" que parece um perfil real.
 *
 * O parâmetro `fallback` é mantido apenas para compatibilidade. Quando passado
 * como string vazia, retorna apenas "@" + sentinel.
 */
export function getPublicHandle(p: AnyProfile, fallback?: string): string {
  const uname = cleanUsername(p?.username);
  if (uname) return `@${uname}`;
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    const base = fallback
      .toString()
      .replace(/^@+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "")
      .replace(/^_+|_+$/g, "");
    if (base) return `@${base}`;
  }
  return LOADING_HANDLE;
}

/**
 * Versão sem @ (para `alt`, share text, "Assinar canal de X" etc.).
 */
export function getPublicHandlePlain(p: AnyProfile, fallback?: string): string {
  return getPublicHandle(p, fallback).replace(/^@/, "");
}

/**
 * Inicial usada em <AvatarFallback> — pega a primeira letra do username
 * para manter coerência visual com o handle exibido. Quando o handle ainda
 * não chegou, devolve "·" (visualmente neutro, não letra).
 */
export function getHandleInitial(p: AnyProfile): string {
  if (!hasRealHandle(p)) return "·";
  const handle = getPublicHandlePlain(p);
  return (handle[0] || "U").toUpperCase();
}
