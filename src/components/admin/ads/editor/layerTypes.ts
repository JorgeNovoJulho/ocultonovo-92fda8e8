// Tipos do documento do editor visual de anúncios
export type LayerKind = "text" | "image" | "shape";

export type AnimationKind =
  | "none"
  | "fade-in"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "pop"
  | "blur-in";

export interface LayerAnimation {
  kind: AnimationKind;
  duration: number; // ms
  delay: number; // ms
}

export interface BaseLayer {
  id: string;
  kind: LayerKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
  hidden?: boolean;
  name?: string;
  animation?: LayerAnimation;
}

export interface TextLayer extends BaseLayer {
  kind: "text";
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align: "left" | "center" | "right";
  color: string;
  stroke?: { color: string; width: number } | null;
  lineHeight: number;
  letterSpacing: number;
}

export interface ImageLayer extends BaseLayer {
  kind: "image";
  src: string;
  fit: "cover" | "contain";
  radius?: number;
  /** filtros leves */
  filterBlur?: number; // px
  filterDarken?: number; // 0..1
  vignette?: boolean;
  /** ajustes de cor (0..200, 100 = neutro) */
  brightness?: number;
  contrast?: number;
  saturation?: number;
  /** hue rotate em graus (-180..180) */
  hue?: number;
  /** 0..100 */
  sepia?: number;
  grayscale?: number;
  invert?: number;
  /** efeitos */
  shadow?: { x: number; y: number; blur: number; color: string } | null;
  glow?: { blur: number; color: string } | null;
  /** borda da imagem */
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "double";
  /** margem visual interna (faixa de fundo ao redor) */
  margin?: number;
  marginColor?: string;
  /** interatividade */
  link?: string | null;
}

export type ShapeKind = "rect" | "circle" | "line" | "svg";
export interface ShapeLayer extends BaseLayer {
  kind: "shape";
  shape: ShapeKind;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  /** Quando shape === "svg": path no viewBox padrão 0 0 100 100. */
  svgPath?: string;
  svgViewBox?: string;
}

export type AnyLayer = TextLayer | ImageLayer | ShapeLayer;

export interface AdDoc {
  width: number;
  height: number;
  background: string;
  backgroundImage?: string | null;
  layers: AnyLayer[];
  /** Páginas adicionais (sl ides). Página 0 = este próprio doc. */
  pages?: AdDoc[];
}

export function newId(prefix = "l"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyDoc(width = 1080, height = 1350): AdDoc {
  return {
    width,
    height,
    background: "#0b0b10",
    backgroundImage: null,
    layers: [],
  };
}

export function defaultTextLayer(partial: Partial<TextLayer> = {}): TextLayer {
  return {
    id: newId("t"),
    kind: "text",
    x: 80,
    y: 80,
    w: 600,
    h: 120,
    rotation: 0,
    opacity: 1,
    text: "Seu título aqui",
    fontFamily: "Inter",
    fontWeight: 800,
    fontSize: 72,
    align: "left",
    color: "#ffffff",
    stroke: null,
    lineHeight: 1.1,
    letterSpacing: 0,
    ...partial,
  };
}

export function defaultImageLayer(src: string, partial: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: newId("i"),
    kind: "image",
    x: 80,
    y: 240,
    w: 600,
    h: 600,
    rotation: 0,
    opacity: 1,
    src,
    fit: "cover",
    radius: 16,
    ...partial,
  };
}

export function defaultShapeLayer(shape: ShapeKind, partial: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id: newId("s"),
    kind: "shape",
    x: 100,
    y: 100,
    w: 280,
    h: 280,
    rotation: 0,
    opacity: 1,
    shape,
    fill: "#ec4899",
    stroke: undefined,
    strokeWidth: 0,
    radius: shape === "rect" ? 16 : 0,
    ...partial,
  };
}

/** Paleta para o painel Esquema. */
export interface AdPalette {
  id: string;
  name: string;
  /** primeira cor = fundo, demais = acentos/texto */
  colors: string[];
}

export const AD_PALETTES: AdPalette[] = [
  { id: "midnight", name: "Midnight", colors: ["#0b0b10", "#ec4899", "#f5d0e9", "#ffffff"] },
  { id: "neon", name: "Neon Mint", colors: ["#0d1b2a", "#2dd4a8", "#73ffb8", "#ffffff"] },
  { id: "noir", name: "Noir & Gold", colors: ["#0d0d0d", "#c9a84c", "#f0d78c", "#ffffff"] },
  { id: "blush", name: "Blush", colors: ["#1a1024", "#f8c5d4", "#e88aab", "#ffffff"] },
  { id: "sunset", name: "Sunset", colors: ["#1a0a1a", "#ff6b35", "#e84393", "#ffe8d4"] },
  { id: "ocean", name: "Ocean Deep", colors: ["#0c2340", "#5cbdb9", "#2d8a9e", "#ffffff"] },
  { id: "paper", name: "Paper & Ink", colors: ["#f5f3ee", "#1a1a1a", "#c9a84c", "#0d0d0d"] },
  { id: "vapor", name: "Vapor Chrome", colors: ["#1a1a2e", "#c4b5fd", "#67e8f9", "#ffffff"] },
];
