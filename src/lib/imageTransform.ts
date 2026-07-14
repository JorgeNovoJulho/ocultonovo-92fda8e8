/**
 * Helpers para reduzir o peso de imagens carregadas do Supabase Storage
 * usando o endpoint público de transformação (`/storage/v1/render/image/public/`).
 *
 * - Reescreve URLs do bucket público para o endpoint de render (image transforms)
 * - Adiciona `width`, `quality` e `resize=cover` para gerar miniaturas WebP
 * - Faz no-op para URLs externas (não-Supabase), data: ou blob:
 *
 * Use SEMPRE para listas/carrosséis (cards, grids, avatares pequenos) — nunca
 * para a galeria fullscreen, onde queremos o original.
 */
const OBJECT_MARKER = "/storage/v1/object/public/";
const RENDER_MARKER = "/storage/v1/render/image/public/";

export interface ImageThumbOptions {
  /** Largura alvo em pixels físicos (Supabase já considera DPR no servidor). */
  width: number;
  /** Altura alvo em pixels físicos. Necessária para crop quadrado (avatar). */
  height?: number;
  /** Qualidade JPEG/WebP (1–100). Padrão 70 — bom balanço para avatares. */
  quality?: number;
  /** Estratégia de redimensionamento. Padrão `cover`. */
  resize?: "cover" | "contain" | "fill";
}

export function buildSupabaseImageThumb(
  url: string | null | undefined,
  opts: ImageThumbOptions,
): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;

  // Só transforma URLs públicas do Supabase Storage.
  const idx = trimmed.indexOf(OBJECT_MARKER);
  if (idx < 0) return trimmed;

  const base = trimmed.slice(0, idx) + RENDER_MARKER + trimmed.slice(idx + OBJECT_MARKER.length);
  const cleanBase = base.split("?")[0];
  const params = new URLSearchParams();
  params.set("width", String(Math.max(64, Math.round(opts.width))));
  if (opts.height && opts.height > 0) {
    params.set("height", String(Math.max(64, Math.round(opts.height))));
  }
  params.set("quality", String(opts.quality ?? 70));
  params.set("resize", opts.resize ?? "cover");
  return `${cleanBase}?${params.toString()}`;
}
