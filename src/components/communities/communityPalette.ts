/**
 * Paleta de cores de destaque para comunidades.
 * 17 cores (7 originais + 10 novas). Compartilhada entre Create/Edit.
 */
export const COMMUNITY_ACCENT_PALETTE: string[] = [
  // originais
  '#a855f7', // roxo
  '#ec4899', // rosa
  '#f59e0b', // âmbar
  '#10b981', // esmeralda
  '#3b82f6', // azul
  '#ef4444', // vermelho
  '#6366f1', // índigo
  // +10 novas
  '#14b8a6', // teal
  '#0ea5e9', // sky
  '#06b6d4', // ciano
  '#84cc16', // lime
  '#22c55e', // verde
  '#eab308', // amarelo
  '#f97316', // laranja
  '#d946ef', // fúcsia
  '#8b5cf6', // violeta
  '#64748b', // ardósia
];

/**
 * Converte #RRGGBB para "r, g, b" (para usar em rgba()/CSS vars).
 * Fallback seguro para roxo padrão.
 */
export function hexToRgbTriplet(hex?: string | null): string {
  const fallback = '168, 85, 247';
  if (!hex) return fallback;
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
