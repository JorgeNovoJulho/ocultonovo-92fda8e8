/**
 * Detecta se uma URL de mídia é um placeholder (gerado automaticamente
 * porque o usuário não enviou foto/banner próprios).
 *
 * Considera placeholder:
 *  - URL nula/vazia
 *  - URL contendo `/_placeholders/` ou `/_placeholder/`
 *  - URL contendo `placeholder` no nome do arquivo
 */
export function isPlaceholderMedia(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.toLowerCase();
  if (/\/_placeholders?\//.test(u)) return true;
  if (/placeholder/i.test(u)) return true;
  return false;
}

/** Alias mantido para compatibilidade com código já existente. */
export const isPlaceholderUrl = isPlaceholderMedia;

