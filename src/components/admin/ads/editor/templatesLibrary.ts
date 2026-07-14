// Biblioteca de templates ricos no formato AdDoc.
// Cada template é um documento completo, editável camada a camada.
import { AdDoc, defaultImageLayer, defaultShapeLayer, defaultTextLayer } from "./layerTypes";

export type TemplateStyle = "minimal" | "bold" | "luxo" | "neon" | "editorial" | "festa";
export type TemplateColor = "escuro" | "claro" | "rosa" | "dourado" | "azul" | "verde" | "laranja" | "roxo";

export interface RichTemplate {
  id: string;
  name: string;
  category: "promo" | "evento" | "vip" | "story" | "carrossel";
  style?: TemplateStyle;
  colorTags?: TemplateColor[];
  keywords?: string[];
  doc: AdDoc;
  thumb?: string;
  /** Frase curta com recomendação de uso (público/objetivo). */
  recommendation?: string;
  /** Lista de boas práticas / dicas rápidas para esse modelo. */
  tips?: string[];
}

/** Recomendações padrão geradas a partir da categoria/estilo quando o template não traz custom. */
export function getTemplateRecommendation(t: RichTemplate): { headline: string; tips: string[] } {
  if (t.recommendation || t.tips) {
    return {
      headline: t.recommendation ?? `Indicado para ${TEMPLATE_CATEGORY_LABEL[t.category].toLowerCase()}`,
      tips: t.tips ?? [],
    };
  }
  const byCategory: Record<RichTemplate["category"], { headline: string; tips: string[] }> = {
    promo: {
      headline: "Ideal para promoções, descontos e ofertas com urgência.",
      tips: [
        "Mantenha o desconto em destaque no topo",
        "Inclua prazo curto (hoje, 24h) para gerar urgência",
        "Use 1 CTA claro: 'Garantir agora' ou 'Aproveitar'",
      ],
    },
    evento: {
      headline: "Perfeito para divulgar festas, encontros e eventos VIP.",
      tips: [
        "Coloque data, hora e local com hierarquia clara",
        "Reforce o tipo de público (Casais, VIPs, +18)",
        "Adicione QR Code com link de RSVP",
      ],
    },
    vip: {
      headline: "Recomendado para conteúdo exclusivo, planos premium e VIP.",
      tips: [
        "Destaque o selo VIP e os benefícios",
        "Use paleta dourada/escura para reforçar exclusividade",
        "Termine com CTA de assinatura",
      ],
    },
    story: {
      headline: "Formato 9:16 — pensado para Stories de Instagram e Reels.",
      tips: [
        "Mantenha o foco visual no centro vertical",
        "Texto principal nos 2/3 superiores",
        "Deixe espaço inferior para sticker/CTA do app",
      ],
    },
    carrossel: {
      headline: "Use em sequência de slides para contar uma história.",
      tips: [
        "Crie 3 a 6 páginas com mesmo grid",
        "Conduza do problema → solução → CTA",
        "Mantenha tipografia e paleta consistentes",
      ],
    },
  };
  const base = byCategory[t.category];
  if (t.style === "luxo") base.tips = [...base.tips, "Combina com fontes serifadas e acentos dourados"];
  if (t.style === "neon") base.tips = [...base.tips, "Use sobre fundos escuros para realçar o brilho"];
  if (t.style === "minimal") base.tips = [...base.tips, "Evite poluir — preserve o espaço em branco"];
  return base;
}

export const TEMPLATE_CATEGORY_LABEL: Record<RichTemplate["category"], string> = {
  promo: "Promo",
  evento: "Evento",
  vip: "VIP",
  story: "Story",
  carrossel: "Carrossel",
};

export const TEMPLATE_STYLE_LABEL: Record<TemplateStyle, string> = {
  minimal: "Minimal",
  bold: "Bold",
  luxo: "Luxo",
  neon: "Neon",
  editorial: "Editorial",
  festa: "Festa",
};

export const TEMPLATE_COLOR_LABEL: Record<TemplateColor, string> = {
  escuro: "Escuro",
  claro: "Claro",
  rosa: "Rosa",
  dourado: "Dourado",
  azul: "Azul",
  verde: "Verde",
  laranja: "Laranja",
  roxo: "Roxo",
};

export const TEMPLATE_COLOR_SWATCH: Record<TemplateColor, string> = {
  escuro: "#0b0b10",
  claro: "#f5f3ee",
  rosa: "#ec4899",
  dourado: "#c9a84c",
  azul: "#0c2340",
  verde: "#2dd4a8",
  laranja: "#ff6b35",
  roxo: "#a855f7",
};

const SIZES = {
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
  post: { w: 1080, h: 1350 },
};

function mk(width: number, height: number, background: string, layers: AdDoc["layers"], bgImage?: string): AdDoc {
  return { width, height, background, backgroundImage: bgImage ?? null, layers };
}

export const RICH_TEMPLATES: RichTemplate[] = [
  {
    id: "neon-promo",
    name: "Promo Neon",
    category: "promo",
    doc: mk(SIZES.square.w, SIZES.square.h, "#0b0b10", [
      defaultShapeLayer("circle", { x: -80, y: -80, w: 420, h: 420, fill: "#ec4899", opacity: 0.35 }),
      defaultShapeLayer("circle", { x: 760, y: 760, w: 400, h: 400, fill: "#2dd4a8", opacity: 0.3 }),
      defaultTextLayer({ text: "OFERTA RELÂMPAGO", x: 80, y: 160, w: 920, h: 90, fontSize: 64, fontWeight: 900, color: "#fde68a", letterSpacing: 6 }),
      defaultTextLayer({ text: "50% OFF", x: 80, y: 280, w: 920, h: 260, fontSize: 220, fontWeight: 900, color: "#ffffff" }),
      defaultTextLayer({ text: "Apenas hoje · vagas limitadas", x: 80, y: 580, w: 920, h: 70, fontSize: 36, fontWeight: 400, color: "#f5d0e9" }),
      defaultShapeLayer("rect", { x: 80, y: 820, w: 380, h: 110, fill: "#ec4899", radius: 999 }),
      defaultTextLayer({ text: "Garantir agora", x: 80, y: 845, w: 380, h: 60, fontSize: 36, fontWeight: 800, color: "#ffffff", align: "center" }),
    ]),
  },
  {
    id: "vip-gold",
    name: "VIP Dourado",
    category: "vip",
    doc: mk(SIZES.post.w, SIZES.post.h, "#0d0d0d", [
      defaultShapeLayer("rect", { x: 0, y: 0, w: 1080, h: 60, fill: "#c9a84c" }),
      defaultShapeLayer("rect", { x: 0, y: 1290, w: 1080, h: 60, fill: "#c9a84c" }),
      defaultTextLayer({ text: "EXCLUSIVO VIP", x: 80, y: 180, w: 920, h: 70, fontSize: 32, fontWeight: 600, color: "#c9a84c", letterSpacing: 12 }),
      defaultTextLayer({ text: "Acesso ilimitado", x: 80, y: 280, w: 920, h: 180, fontSize: 110, fontWeight: 900, color: "#ffffff" }),
      defaultTextLayer({ text: "Chats privados, encontros e bastidores que ninguém mais vê.", x: 80, y: 520, w: 920, h: 200, fontSize: 38, fontWeight: 400, color: "#f0d78c", lineHeight: 1.3 }),
      defaultShapeLayer("rect", { x: 80, y: 800, w: 460, h: 120, fill: "#c9a84c", radius: 8 }),
      defaultTextLayer({ text: "Assinar agora", x: 80, y: 830, w: 460, h: 60, fontSize: 40, fontWeight: 800, color: "#0d0d0d", align: "center" }),
    ]),
  },
  {
    id: "story-blush",
    name: "Story Blush",
    category: "story",
    doc: mk(SIZES.story.w, SIZES.story.h, "#1a0a1a", [
      defaultShapeLayer("circle", { x: -200, y: 1200, w: 800, h: 800, fill: "#f8c5d4", opacity: 0.5 }),
      defaultShapeLayer("circle", { x: 600, y: -100, w: 600, h: 600, fill: "#e88aab", opacity: 0.45 }),
      defaultTextLayer({ text: "convite", x: 80, y: 280, w: 920, h: 80, fontSize: 56, fontWeight: 300, color: "#f8c5d4", italic: true }),
      defaultTextLayer({ text: "Você é o segredo da noite", x: 80, y: 400, w: 920, h: 360, fontSize: 110, fontWeight: 800, color: "#ffffff", lineHeight: 1.05 }),
      defaultTextLayer({ text: "Deslize para subir →", x: 80, y: 1700, w: 920, h: 60, fontSize: 32, fontWeight: 500, color: "#f8c5d4", align: "center" }),
    ]),
  },
  {
    id: "evento-ocean",
    name: "Evento Ocean",
    category: "evento",
    doc: mk(SIZES.square.w, SIZES.square.h, "#0c2340", [
      defaultShapeLayer("rect", { x: 80, y: 80, w: 920, h: 920, fill: "#0c2340", radius: 24, stroke: "#5cbdb9", strokeWidth: 4 }),
      defaultTextLayer({ text: "SÁBADO", x: 80, y: 160, w: 920, h: 60, fontSize: 36, fontWeight: 600, color: "#5cbdb9", letterSpacing: 14, align: "center" }),
      defaultTextLayer({ text: "Noite\nDesejo", x: 80, y: 260, w: 920, h: 400, fontSize: 180, fontWeight: 900, color: "#ffffff", align: "center", lineHeight: 0.95 }),
      defaultTextLayer({ text: "23h · Local revelado por DM", x: 80, y: 720, w: 920, h: 60, fontSize: 32, fontWeight: 400, color: "#5cbdb9", align: "center" }),
      defaultShapeLayer("rect", { x: 340, y: 840, w: 400, h: 100, fill: "#5cbdb9", radius: 999 }),
      defaultTextLayer({ text: "Quero entrar", x: 340, y: 865, w: 400, h: 60, fontSize: 36, fontWeight: 800, color: "#0c2340", align: "center" }),
    ]),
  },
  {
    id: "duo-split",
    name: "Duo Split",
    category: "promo",
    doc: mk(SIZES.square.w, SIZES.square.h, "#1a1a1a", [
      defaultShapeLayer("rect", { x: 0, y: 0, w: 540, h: 1080, fill: "#ec4899" }),
      defaultShapeLayer("rect", { x: 540, y: 0, w: 540, h: 1080, fill: "#0b0b10" }),
      defaultTextLayer({ text: "ANTES", x: 40, y: 480, w: 460, h: 120, fontSize: 96, fontWeight: 900, color: "#ffffff", align: "center" }),
      defaultTextLayer({ text: "DEPOIS", x: 580, y: 480, w: 460, h: 120, fontSize: 96, fontWeight: 900, color: "#ec4899", align: "center" }),
      defaultShapeLayer("circle", { x: 480, y: 480, w: 120, h: 120, fill: "#fde68a" }),
      defaultTextLayer({ text: "VS", x: 480, y: 505, w: 120, h: 70, fontSize: 52, fontWeight: 900, color: "#0b0b10", align: "center" }),
    ]),
  },
  {
    id: "minimal-edit",
    name: "Minimal Editorial",
    category: "promo",
    doc: mk(SIZES.post.w, SIZES.post.h, "#f5f3ee", [
      defaultShapeLayer("rect", { x: 80, y: 80, w: 920, h: 1190, fill: "#f5f3ee", radius: 0, stroke: "#0d0d0d", strokeWidth: 2 }),
      defaultTextLayer({ text: "Nº 014 · Boletim", x: 120, y: 120, w: 840, h: 50, fontSize: 26, fontWeight: 400, color: "#0d0d0d", italic: true, letterSpacing: 6 }),
      defaultTextLayer({ text: "O que ninguém te conta sobre Oculto", x: 120, y: 220, w: 840, h: 480, fontSize: 96, fontWeight: 900, color: "#0d0d0d", lineHeight: 1.05 }),
      defaultShapeLayer("line", { x: 120, y: 750, w: 100, h: 6, fill: "#c9a84c", strokeWidth: 6 }),
      defaultTextLayer({ text: "Leia agora · 3 min", x: 120, y: 800, w: 840, h: 60, fontSize: 30, fontWeight: 600, color: "#0d0d0d" }),
    ]),
  },
  {
    id: "carrossel-1",
    name: "Carrossel · 3 páginas",
    category: "carrossel",
    doc: {
      width: SIZES.square.w,
      height: SIZES.square.h,
      background: "#0b0b10",
      backgroundImage: null,
      layers: [
        defaultTextLayer({ text: "01", x: 80, y: 120, w: 200, h: 100, fontSize: 64, fontWeight: 900, color: "#ec4899" }),
        defaultTextLayer({ text: "O que é o\nVIP da Oculto?", x: 80, y: 360, w: 920, h: 340, fontSize: 130, fontWeight: 900, color: "#ffffff", lineHeight: 1 }),
        defaultTextLayer({ text: "Arraste →", x: 80, y: 940, w: 920, h: 60, fontSize: 30, fontWeight: 500, color: "#f5d0e9", align: "right" }),
      ],
      pages: [
        mk(SIZES.square.w, SIZES.square.h, "#0b0b10", [
          defaultTextLayer({ text: "02", x: 80, y: 120, w: 200, h: 100, fontSize: 64, fontWeight: 900, color: "#2dd4a8" }),
          defaultTextLayer({ text: "Acesso a tudo\nque é exclusivo", x: 80, y: 360, w: 920, h: 340, fontSize: 110, fontWeight: 900, color: "#ffffff", lineHeight: 1.05 }),
          defaultTextLayer({ text: "Arraste →", x: 80, y: 940, w: 920, h: 60, fontSize: 30, fontWeight: 500, color: "#f5d0e9", align: "right" }),
        ]),
        mk(SIZES.square.w, SIZES.square.h, "#0b0b10", [
          defaultTextLayer({ text: "03", x: 80, y: 120, w: 200, h: 100, fontSize: 64, fontWeight: 900, color: "#fde68a" }),
          defaultTextLayer({ text: "Comece agora\npor R$ 25,90/mês", x: 80, y: 360, w: 920, h: 340, fontSize: 110, fontWeight: 900, color: "#ffffff", lineHeight: 1.05 }),
          defaultShapeLayer("rect", { x: 80, y: 880, w: 400, h: 110, fill: "#ec4899", radius: 999 }),
          defaultTextLayer({ text: "Quero VIP", x: 80, y: 905, w: 400, h: 60, fontSize: 36, fontWeight: 800, color: "#ffffff", align: "center" }),
        ]),
      ],
    },
  },
  // ============ NOVOS TEMPLATES MODERNOS ============
  {
    id: "glow-magenta",
    name: "Glow Magenta",
    category: "promo",
    doc: mk(SIZES.square.w, SIZES.square.h, "#0a0014", [
      defaultShapeLayer("circle", { x: -150, y: -150, w: 600, h: 600, fill: "#ec4899", opacity: 0.45 }),
      defaultShapeLayer("circle", { x: 600, y: 700, w: 700, h: 700, fill: "#a855f7", opacity: 0.35 }),
      defaultShapeLayer("rect", { x: 80, y: 80, w: 920, h: 920, fill: "transparent", radius: 32, stroke: "#ec4899", strokeWidth: 2 }),
      defaultTextLayer({ text: "EDIÇÃO LIMITADA", x: 80, y: 200, w: 920, h: 60, fontSize: 28, fontWeight: 700, color: "#f5d0e9", letterSpacing: 14, align: "center", fontFamily: "Space Grotesk" }),
      defaultTextLayer({ text: "TUDO\nMUDA\nHOJE", x: 80, y: 290, w: 920, h: 540, fontSize: 200, fontWeight: 900, color: "#ffffff", align: "center", lineHeight: 0.92, fontFamily: "Anton" }),
      defaultShapeLayer("rect", { x: 290, y: 870, w: 500, h: 110, fill: "#ec4899", radius: 999 }),
      defaultTextLayer({ text: "Quero entrar →", x: 290, y: 895, w: 500, h: 60, fontSize: 40, fontWeight: 800, color: "#ffffff", align: "center", fontFamily: "Poppins" }),
    ]),
  },
  {
    id: "luxe-black",
    name: "Luxe Black",
    category: "vip",
    doc: mk(SIZES.post.w, SIZES.post.h, "#000000", [
      defaultShapeLayer("rect", { x: 60, y: 60, w: 960, h: 1230, fill: "transparent", radius: 12, stroke: "#c9a84c", strokeWidth: 1 }),
      defaultShapeLayer("rect", { x: 120, y: 120, w: 840, h: 1110, fill: "transparent", radius: 6, stroke: "#c9a84c", strokeWidth: 1, opacity: 0.4 }),
      defaultTextLayer({ text: "OCULTO", x: 60, y: 230, w: 960, h: 70, fontSize: 36, fontWeight: 400, color: "#c9a84c", letterSpacing: 28, align: "center", fontFamily: "Cormorant Garamond" }),
      defaultTextLayer({ text: "—  membros  —", x: 60, y: 310, w: 960, h: 40, fontSize: 18, fontWeight: 400, color: "#8a7838", letterSpacing: 8, align: "center", italic: true, fontFamily: "Cormorant Garamond" }),
      defaultTextLayer({ text: "Acesso\nReservado", x: 60, y: 420, w: 960, h: 360, fontSize: 130, fontWeight: 400, color: "#ffffff", align: "center", lineHeight: 1.0, italic: true, fontFamily: "Playfair Display" }),
      defaultShapeLayer("line", { x: 460, y: 820, w: 160, h: 1, fill: "#c9a84c", strokeWidth: 1 }),
      defaultTextLayer({ text: "Apenas convidados podem cruzar esta porta.", x: 80, y: 870, w: 920, h: 80, fontSize: 28, fontWeight: 400, color: "#f0d78c", align: "center", fontFamily: "Lora" }),
      defaultShapeLayer("rect", { x: 290, y: 1050, w: 500, h: 110, fill: "#c9a84c", radius: 0 }),
      defaultTextLayer({ text: "Solicitar convite", x: 290, y: 1075, w: 500, h: 60, fontSize: 32, fontWeight: 700, color: "#000000", align: "center", letterSpacing: 4, fontFamily: "Montserrat" }),
    ]),
  },
  {
    id: "cyber-grid",
    name: "Cyber Grid",
    category: "evento",
    doc: mk(SIZES.square.w, SIZES.square.h, "#05050f", [
      defaultShapeLayer("rect", { x: 0, y: 0, w: 1080, h: 540, fill: "#0a0a24", opacity: 0.6 }),
      defaultShapeLayer("line", { x: 0, y: 540, w: 1080, h: 2, fill: "#2dd4a8", strokeWidth: 2 }),
      defaultShapeLayer("circle", { x: 700, y: 100, w: 320, h: 320, fill: "#2dd4a8", opacity: 0.18 }),
      defaultShapeLayer("circle", { x: -100, y: 700, w: 400, h: 400, fill: "#67e8f9", opacity: 0.15 }),
      defaultTextLayer({ text: "// SISTEMA . NOITE_03", x: 80, y: 140, w: 920, h: 50, fontSize: 22, fontWeight: 700, color: "#2dd4a8", letterSpacing: 6, fontFamily: "JetBrains Mono" }),
      defaultTextLayer({ text: "Conexões\nclandestinas", x: 80, y: 210, w: 920, h: 320, fontSize: 130, fontWeight: 900, color: "#ffffff", lineHeight: 0.95, fontFamily: "Space Grotesk" }),
      defaultTextLayer({ text: "23:00 . LOCAL CRIPTOGRAFADO", x: 80, y: 600, w: 920, h: 50, fontSize: 22, fontWeight: 600, color: "#67e8f9", letterSpacing: 4, fontFamily: "JetBrains Mono" }),
      defaultTextLayer({ text: "Apenas verificados\nrecebem o endereço.", x: 80, y: 670, w: 920, h: 160, fontSize: 38, fontWeight: 400, color: "#cffafe", lineHeight: 1.25, fontFamily: "Inter" }),
      defaultShapeLayer("rect", { x: 80, y: 880, w: 380, h: 100, fill: "#2dd4a8", radius: 4 }),
      defaultTextLayer({ text: "ENTRAR →", x: 80, y: 905, w: 380, h: 60, fontSize: 32, fontWeight: 800, color: "#05050f", align: "center", letterSpacing: 6, fontFamily: "Space Grotesk" }),
    ]),
  },
  {
    id: "sunset-vibe",
    name: "Sunset Vibe",
    category: "story",
    doc: mk(SIZES.story.w, SIZES.story.h, "#1a0a1a", [
      defaultShapeLayer("circle", { x: -300, y: -200, w: 1100, h: 1100, fill: "#ff6b35", opacity: 0.55 }),
      defaultShapeLayer("circle", { x: 200, y: 800, w: 1000, h: 1000, fill: "#e84393", opacity: 0.5 }),
      defaultShapeLayer("circle", { x: -200, y: 1400, w: 900, h: 900, fill: "#fde68a", opacity: 0.35 }),
      defaultTextLayer({ text: "Verão · OCULTO", x: 80, y: 320, w: 920, h: 60, fontSize: 32, fontWeight: 300, color: "#fde68a", italic: true, fontFamily: "Cormorant Garamond" }),
      defaultTextLayer({ text: "Você é\no calor\nda noite", x: 80, y: 420, w: 920, h: 600, fontSize: 160, fontWeight: 900, color: "#ffffff", lineHeight: 0.95, fontFamily: "Outfit" }),
      defaultShapeLayer("line", { x: 80, y: 1060, w: 80, h: 4, fill: "#fde68a", strokeWidth: 4 }),
      defaultTextLayer({ text: "edição de verão · vagas limitadas", x: 80, y: 1110, w: 920, h: 60, fontSize: 28, fontWeight: 500, color: "#fff5d0", fontFamily: "Inter" }),
      defaultShapeLayer("rect", { x: 80, y: 1700, w: 920, h: 100, fill: "#ffffff", radius: 999 }),
      defaultTextLayer({ text: "Deslize para entrar →", x: 80, y: 1725, w: 920, h: 60, fontSize: 32, fontWeight: 700, color: "#1a0a1a", align: "center", fontFamily: "Outfit" }),
    ]),
  },
  {
    id: "split-magazine",
    name: "Split Magazine",
    category: "promo",
    doc: mk(SIZES.post.w, SIZES.post.h, "#f5f3ee", [
      defaultShapeLayer("rect", { x: 0, y: 0, w: 1080, h: 700, fill: "#0d0d0d" }),
      defaultShapeLayer("rect", { x: 60, y: 600, w: 220, h: 220, fill: "#c9a84c", radius: 999 }),
      defaultTextLayer({ text: "Nº 047", x: 60, y: 110, w: 200, h: 50, fontSize: 26, fontWeight: 400, color: "#c9a84c", letterSpacing: 8, fontFamily: "Cormorant Garamond" }),
      defaultTextLayer({ text: "EDITORIAL", x: 60, y: 160, w: 600, h: 50, fontSize: 22, fontWeight: 700, color: "#f5f3ee", letterSpacing: 12, fontFamily: "Inter" }),
      defaultTextLayer({ text: "O que\nninguém\nte conta", x: 60, y: 230, w: 960, h: 420, fontSize: 140, fontWeight: 900, color: "#ffffff", lineHeight: 0.95, italic: true, fontFamily: "Playfair Display" }),
      defaultTextLayer({ text: "Bastidores, encontros reais e os segredos que só circulam entre membros.", x: 60, y: 880, w: 960, h: 180, fontSize: 36, fontWeight: 400, color: "#1a1a1a", lineHeight: 1.35, fontFamily: "Lora" }),
      defaultShapeLayer("line", { x: 60, y: 1110, w: 100, h: 4, fill: "#c9a84c", strokeWidth: 4 }),
      defaultTextLayer({ text: "Ler agora · 5 min", x: 60, y: 1160, w: 960, h: 60, fontSize: 28, fontWeight: 700, color: "#0d0d0d", letterSpacing: 2, fontFamily: "Inter" }),
    ]),
  },
  {
    id: "gradient-promo",
    name: "Gradient Bold",
    category: "promo",
    doc: mk(SIZES.square.w, SIZES.square.h, "#1a0a2e", [
      defaultShapeLayer("circle", { x: -200, y: -200, w: 800, h: 800, fill: "#a78bfa", opacity: 0.6 }),
      defaultShapeLayer("circle", { x: 500, y: 500, w: 800, h: 800, fill: "#67e8f9", opacity: 0.55 }),
      defaultShapeLayer("circle", { x: 300, y: 200, w: 400, h: 400, fill: "#ec4899", opacity: 0.5 }),
      defaultTextLayer({ text: "Premium . 50% OFF", x: 80, y: 200, w: 920, h: 60, fontSize: 30, fontWeight: 700, color: "#ffffff", letterSpacing: 8, align: "center", fontFamily: "Space Grotesk" }),
      defaultTextLayer({ text: "Black\nFriday", x: 80, y: 290, w: 920, h: 520, fontSize: 240, fontWeight: 900, color: "#ffffff", lineHeight: 0.9, align: "center", fontFamily: "Archivo Black" }),
      defaultShapeLayer("rect", { x: 240, y: 850, w: 600, h: 130, fill: "#0a0014", radius: 999 }),
      defaultShapeLayer("rect", { x: 245, y: 855, w: 590, h: 120, fill: "transparent", radius: 999, stroke: "#ffffff", strokeWidth: 2 }),
      defaultTextLayer({ text: "Quero o desconto", x: 240, y: 885, w: 600, h: 60, fontSize: 40, fontWeight: 800, color: "#ffffff", align: "center", fontFamily: "Poppins" }),
    ]),
  },
  {
    id: "minimal-card",
    name: "Minimal Card",
    category: "promo",
    doc: mk(SIZES.square.w, SIZES.square.h, "#fafbfc", [
      defaultShapeLayer("rect", { x: 100, y: 100, w: 880, h: 880, fill: "#ffffff", radius: 24, stroke: "#e8ecf1", strokeWidth: 1 }),
      defaultShapeLayer("circle", { x: 440, y: 200, w: 200, h: 200, fill: "#3b82f6" }),
      defaultTextLayer({ text: "novidade", x: 100, y: 440, w: 880, h: 50, fontSize: 22, fontWeight: 500, color: "#94a3b8", letterSpacing: 8, align: "center", fontFamily: "Inter" }),
      defaultTextLayer({ text: "Encontre seu\npar perfeito", x: 100, y: 500, w: 880, h: 240, fontSize: 84, fontWeight: 800, color: "#0f172a", align: "center", lineHeight: 1.1, fontFamily: "Plus Jakarta Sans" }),
      defaultTextLayer({ text: "Algoritmo de afinidade que respeita seu tempo.", x: 100, y: 760, w: 880, h: 60, fontSize: 26, fontWeight: 400, color: "#475569", align: "center", fontFamily: "Inter" }),
      defaultShapeLayer("rect", { x: 380, y: 850, w: 320, h: 90, fill: "#0f172a", radius: 999 }),
      defaultTextLayer({ text: "Começar grátis", x: 380, y: 875, w: 320, h: 50, fontSize: 28, fontWeight: 700, color: "#ffffff", align: "center", fontFamily: "Plus Jakarta Sans" }),
    ]),
  },
  {
    id: "neon-stripes",
    name: "Neon Stripes",
    category: "evento",
    doc: mk(SIZES.square.w, SIZES.square.h, "#0a0014", [
      defaultShapeLayer("rect", { x: 0, y: 120, w: 1080, h: 30, fill: "#ec4899", opacity: 0.9 }),
      defaultShapeLayer("rect", { x: 0, y: 180, w: 1080, h: 18, fill: "#a855f7", opacity: 0.8 }),
      defaultShapeLayer("rect", { x: 0, y: 880, w: 1080, h: 30, fill: "#67e8f9", opacity: 0.9 }),
      defaultShapeLayer("rect", { x: 0, y: 940, w: 1080, h: 18, fill: "#2dd4a8", opacity: 0.8 }),
      defaultTextLayer({ text: "SEXTA · 23H", x: 80, y: 320, w: 920, h: 80, fontSize: 56, fontWeight: 700, color: "#ec4899", letterSpacing: 16, align: "center", fontFamily: "Bebas Neue" }),
      defaultTextLayer({ text: "NIGHT\nCLUB\nVIP", x: 80, y: 410, w: 920, h: 440, fontSize: 220, fontWeight: 900, color: "#ffffff", align: "center", lineHeight: 0.9, fontFamily: "Anton" }),
      defaultTextLayer({ text: "Lista até 22h · DM @oculto", x: 80, y: 720, w: 920, h: 50, fontSize: 26, fontWeight: 500, color: "#67e8f9", letterSpacing: 4, align: "center", fontFamily: "Space Grotesk" }),
    ]),
  },
];

// ============ Tagging automático (estilo/cor) para filtros ============
const TEMPLATE_TAGS: Record<string, { style: TemplateStyle; colorTags: TemplateColor[]; keywords?: string[] }> = {
  "neon-promo": { style: "neon", colorTags: ["escuro", "rosa", "verde"], keywords: ["promo", "oferta", "desconto", "flash"] },
  "vip-gold": { style: "luxo", colorTags: ["escuro", "dourado"], keywords: ["vip", "exclusivo", "premium"] },
  "story-blush": { style: "festa", colorTags: ["rosa", "escuro"], keywords: ["story", "convite", "noite"] },
  "evento-ocean": { style: "bold", colorTags: ["azul", "verde"], keywords: ["evento", "sabado", "noite"] },
  "duo-split": { style: "bold", colorTags: ["rosa", "escuro"], keywords: ["antes", "depois", "comparativo"] },
  "minimal-edit": { style: "editorial", colorTags: ["claro", "dourado"], keywords: ["editorial", "boletim", "magazine"] },
  "carrossel-1": { style: "bold", colorTags: ["escuro", "rosa", "verde"], keywords: ["carrossel", "swipe"] },
  "glow-magenta": { style: "neon", colorTags: ["escuro", "rosa", "roxo"], keywords: ["promo", "limitado"] },
  "luxe-black": { style: "luxo", colorTags: ["escuro", "dourado"], keywords: ["vip", "convite", "premium"] },
  "cyber-grid": { style: "neon", colorTags: ["escuro", "verde", "azul"], keywords: ["evento", "tech", "noite"] },
  "sunset-vibe": { style: "festa", colorTags: ["laranja", "rosa"], keywords: ["verao", "story", "calor"] },
  "split-magazine": { style: "editorial", colorTags: ["escuro", "claro", "dourado"], keywords: ["editorial", "magazine"] },
  "gradient-promo": { style: "bold", colorTags: ["roxo", "rosa", "azul"], keywords: ["black friday", "promo"] },
  "minimal-card": { style: "minimal", colorTags: ["claro", "azul"], keywords: ["clean", "card", "novidade"] },
  "neon-stripes": { style: "neon", colorTags: ["escuro", "rosa", "verde"], keywords: ["evento", "club", "noite"] },
};

// Aplica os tags às entradas
for (const t of RICH_TEMPLATES) {
  const tag = TEMPLATE_TAGS[t.id];
  if (tag) {
    t.style = t.style ?? tag.style;
    t.colorTags = t.colorTags ?? tag.colorTags;
    t.keywords = t.keywords ?? tag.keywords;
  }
}
