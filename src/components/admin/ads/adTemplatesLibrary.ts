/**
 * Biblioteca de templates REAIS de anúncios (não apenas swatches de cor).
 * Cada template define um layout visual distinto + copy de exemplo +
 * imagem de referência, tudo editável nos próximos passos do wizard.
 *
 * Os mesmos `variant`s são interpretados pelo AdLivePreview e pelo
 * AdTemplateThumb, garantindo que o que o usuário vê na galeria é
 * exatamente o que ele recebe no preview final.
 */

export type AdVariant =
  | "classic"
  | "bold-overlay"
  | "split-product"
  | "event-dark"
  | "minimal-serif"
  | "magazine"
  | "gradient-text"
  | "neon-glow"
  | "poster-fullbleed"
  | "quote"
  | "gradient-hero"      // Estilo "Propaganda 1": texto branco enorme + CTA outline pill
  | "split-portrait"     // Estilo "Propaganda 2": retrato direita + tipo serif multi-cor esquerda
  | "ribbon-stack"       // Faixas coloridas empilhadas com título grande
  | "duotone-card"       // Imagem em duotone com texto sobreposto colorido
  | "sticker-pop";       // Cores chapadas, badges adesivos, vibe pop

export interface AdTemplatePayload {
  variant: AdVariant;
  accent: string;          // cor principal (HEX)
  bg?: string;             // cor de fundo (HEX) — opcional
  gradient?: string;       // CSS linear-gradient — opcional
  badge?: string;
  badgeStyle?: "solid" | "outline" | "ghost";
  titleFont?: "sans" | "serif" | "display";
  textOnDark?: boolean;
  defaults?: {
    title?: string;
    description?: string;
    ctaText?: string;
    imageUrl?: string;
  };
}

export interface BuiltInAdTemplate {
  id: string;              // prefixado com "builtin:" para não colidir com IDs do DB
  name: string;
  category: "promocao" | "lancamento" | "evento" | "produto" | "servico";
  description: string;
  payload: AdTemplatePayload;
}

// Imagens Unsplash leves (w=480) — servem só como referência visual editável
const U = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=480&q=70&auto=format&fit=crop`;

export const BUILTIN_AD_TEMPLATES: BuiltInAdTemplate[] = [
  {
    id: "builtin:classic-promo",
    name: "Promoção Clássica",
    category: "promocao",
    description: "Imagem topo, título forte, CTA rosa",
    payload: {
      variant: "classic",
      accent: "#ec4899",
      badge: "PROMO",
      badgeStyle: "solid",
      defaults: {
        title: "Promoção relâmpago de hoje",
        description: "Aproveite agora — só por algumas horas.",
        ctaText: "Quero aproveitar",
        imageUrl: U("1607082348824-0a96f2a4b9da"),
      },
    },
  },
  {
    id: "builtin:bold-overlay",
    name: "Manchete Ousada",
    category: "lancamento",
    description: "Título gigante sobre a imagem",
    payload: {
      variant: "bold-overlay",
      accent: "#f59e0b",
      badge: "NOVO",
      badgeStyle: "solid",
      titleFont: "display",
      textOnDark: true,
      defaults: {
        title: "ACABOU DE CHEGAR",
        description: "A novidade que estava faltando no seu feed.",
        ctaText: "Ver agora",
        imageUrl: U("1521572163474-6864f9cf17ab"),
      },
    },
  },
  {
    id: "builtin:split-product",
    name: "Produto Dividido",
    category: "produto",
    description: "Imagem à esquerda, texto à direita",
    payload: {
      variant: "split-product",
      accent: "#22c55e",
      badge: "OFERTA",
      badgeStyle: "outline",
      defaults: {
        title: "Produto em destaque",
        description: "Frete grátis para todo o Brasil hoje.",
        ctaText: "Comprar agora",
        imageUrl: U("1542291026-7eec264c27ff"),
      },
    },
  },
  {
    id: "builtin:event-dark",
    name: "Evento VIP",
    category: "evento",
    description: "Fundo escuro com acento dourado",
    payload: {
      variant: "event-dark",
      accent: "#d4af37",
      bg: "#0a0a14",
      badge: "VIP",
      badgeStyle: "outline",
      titleFont: "display",
      textOnDark: true,
      defaults: {
        title: "Noite Exclusiva Oculto",
        description: "Sábado · 22h · Acesso VIP por convite.",
        ctaText: "Reservar lugar",
        imageUrl: U("1492684223066-81342ee5ff30"),
      },
    },
  },
  {
    id: "builtin:minimal-serif",
    name: "Minimalista Editorial",
    category: "servico",
    description: "Tipografia serifada, fundo limpo",
    payload: {
      variant: "minimal-serif",
      accent: "#0f172a",
      bg: "#fafaf7",
      titleFont: "serif",
      defaults: {
        title: "Uma nova forma de se conectar",
        description: "Curado, discreto, feito para você.",
        ctaText: "Conhecer",
        imageUrl: U("1503602642458-232111445657"),
      },
    },
  },
  {
    id: "builtin:magazine",
    name: "Revista Magazine",
    category: "lancamento",
    description: "Editorial com imagem à direita",
    payload: {
      variant: "magazine",
      accent: "#0ea5e9",
      bg: "#f5f5f0",
      titleFont: "serif",
      badge: "EDIÇÃO 01",
      badgeStyle: "ghost",
      defaults: {
        title: "A capa da nossa nova temporada",
        description: "Histórias, encontros e bastidores.",
        ctaText: "Ler matéria",
        imageUrl: U("1485827404703-89b55fcc595e"),
      },
    },
  },
  {
    id: "builtin:gradient-text",
    name: "Gradiente Vibrante",
    category: "promocao",
    description: "Sem imagem — fundo gradiente puro",
    payload: {
      variant: "gradient-text",
      accent: "#ffffff",
      gradient: "linear-gradient(135deg,#ec4899 0%,#8b5cf6 50%,#3b82f6 100%)",
      badge: "−40%",
      badgeStyle: "ghost",
      titleFont: "display",
      textOnDark: true,
      defaults: {
        title: "Black Week Oculto",
        description: "Descontos que duram só 7 dias.",
        ctaText: "Ver ofertas",
        imageUrl: "",
      },
    },
  },
  {
    id: "builtin:neon-glow",
    name: "Neon Noturno",
    category: "evento",
    description: "Escuro com acento neon",
    payload: {
      variant: "neon-glow",
      accent: "#22d3ee",
      bg: "#05050d",
      badge: "LIVE",
      badgeStyle: "outline",
      titleFont: "display",
      textOnDark: true,
      defaults: {
        title: "Acontece esta noite",
        description: "Entre na sala antes que esgote.",
        ctaText: "Entrar agora",
        imageUrl: U("1514525253161-7a46d19cd819"),
      },
    },
  },
  {
    id: "builtin:poster-fullbleed",
    name: "Poster Full-bleed",
    category: "lancamento",
    description: "Imagem inteira com overlay escuro",
    payload: {
      variant: "poster-fullbleed",
      accent: "#ffffff",
      textOnDark: true,
      titleFont: "display",
      defaults: {
        title: "Você foi escolhido.",
        description: "Acesso antecipado liberado por 48h.",
        ctaText: "Entrar",
        imageUrl: U("1517673400267-0251440c45dc"),
      },
    },
  },
  {
    id: "builtin:quote",
    name: "Depoimento",
    category: "servico",
    description: "Citação grande estilo testemunho",
    payload: {
      variant: "quote",
      accent: "#9333ea",
      bg: "#fbf7ff",
      titleFont: "serif",
      defaults: {
        title: "“Mudou a forma como conheço pessoas.”",
        description: "— Marina, membro Premium",
        ctaText: "Quero experimentar",
        imageUrl: U("1544005313-94ddf0286df2"),
      },
    },
  },
  {
    id: "builtin:flash-sale",
    name: "Flash Sale",
    category: "promocao",
    description: "Urgência com badge gigante",
    payload: {
      variant: "bold-overlay",
      accent: "#ef4444",
      badge: "24H",
      badgeStyle: "solid",
      titleFont: "display",
      textOnDark: true,
      defaults: {
        title: "Só hoje. Só por 24h.",
        description: "Depois disso, volta ao preço normal.",
        ctaText: "Aproveitar",
        imageUrl: U("1607082349566-187342175e2f"),
      },
    },
  },
  {
    id: "builtin:service-pro",
    name: "Serviço Profissional",
    category: "servico",
    description: "Tom corporativo, azul confiança",
    payload: {
      variant: "classic",
      accent: "#2563eb",
      badge: "PRO",
      badgeStyle: "solid",
      defaults: {
        title: "Serviço sob medida para você",
        description: "Atendimento dedicado e resultados reais.",
        ctaText: "Falar com especialista",
        imageUrl: U("1551836022-deb4988cc6c0"),
      },
    },
  },

  // ── Inspirados nas imagens do usuário ──────────────────────────
  {
    id: "builtin:gradient-hero-warm",
    name: "Hero Gradiente Quente",
    category: "promocao",
    description: "Texto branco gigante, CTA pill outline",
    payload: {
      variant: "gradient-hero",
      accent: "#fff5f0",
      gradient: "linear-gradient(135deg,#ff7a59 0%,#ff5fa2 50%,#d946ef 100%)",
      titleFont: "display",
      textOnDark: true,
      defaults: {
        title: "Ser Premium é mais gostoso e divertido. Seja destaque, desbloqueie tudo e elimine as propagandas.",
        description: "",
        ctaText: "Conheça os planos",
        imageUrl: "",
      },
    },
  },
  {
    id: "builtin:gradient-hero-cool",
    name: "Hero Gradiente Frio",
    category: "lancamento",
    description: "Versão azul/violeta da hero gigante",
    payload: {
      variant: "gradient-hero",
      accent: "#f0f5ff",
      gradient: "linear-gradient(135deg,#3b82f6 0%,#8b5cf6 50%,#ec4899 100%)",
      titleFont: "display",
      textOnDark: true,
      defaults: {
        title: "A nova experiência chegou. Faça parte da próxima onda.",
        description: "",
        ctaText: "Quero entrar",
        imageUrl: "",
      },
    },
  },
  {
    id: "builtin:split-portrait-warm",
    name: "Retrato Editorial",
    category: "servico",
    description: "Foto à direita + tipografia serif multi-cor",
    payload: {
      variant: "split-portrait",
      accent: "#b97a4b",
      bg: "#f7f3ef",
      titleFont: "serif",
      defaults: {
        title: "Seja destaque onde todos são iguais. Torne-se Premium.",
        description: "",
        ctaText: "EU QUERO!",
        imageUrl: U("1531123897727-8f129e1688ce"),
      },
    },
  },
  {
    id: "builtin:split-portrait-cool",
    name: "Retrato Editorial Frio",
    category: "lancamento",
    description: "Variante azulada do retrato editorial",
    payload: {
      variant: "split-portrait",
      accent: "#4f46e5",
      bg: "#eef2ff",
      titleFont: "serif",
      defaults: {
        title: "Encontre quem combina com você. Sem máscaras.",
        description: "",
        ctaText: "COMEÇAR AGORA",
        imageUrl: U("1524504388940-b1c1722653e1"),
      },
    },
  },
  {
    id: "builtin:ribbon-stack",
    name: "Faixas Empilhadas",
    category: "promocao",
    description: "3 faixas de cor com manchete vazada",
    payload: {
      variant: "ribbon-stack",
      accent: "#ffffff",
      bg: "#0f172a",
      gradient: "linear-gradient(180deg,#ef4444 0%,#ef4444 33%,#f59e0b 33%,#f59e0b 66%,#10b981 66%,#10b981 100%)",
      titleFont: "display",
      textOnDark: true,
      defaults: {
        title: "TUDO MUDA AGORA",
        description: "3 dias de ofertas inéditas.",
        ctaText: "Aproveitar",
        imageUrl: "",
      },
    },
  },
  {
    id: "builtin:duotone-card",
    name: "Duotone Vibrante",
    category: "evento",
    description: "Imagem em duotone com texto sobreposto",
    payload: {
      variant: "duotone-card",
      accent: "#fde047",
      bg: "#0f172a",
      titleFont: "display",
      textOnDark: true,
      badge: "EXCLUSIVO",
      badgeStyle: "solid",
      defaults: {
        title: "A noite onde tudo acontece",
        description: "Lista VIP aberta por 24h.",
        ctaText: "Entrar na lista",
        imageUrl: U("1492684223066-81342ee5ff30"),
      },
    },
  },
  {
    id: "builtin:sticker-pop",
    name: "Sticker Pop",
    category: "produto",
    description: "Cores chapadas, badges adesivos, vibe pop",
    payload: {
      variant: "sticker-pop",
      accent: "#fde047",
      bg: "#fef08a",
      titleFont: "display",
      badge: "HOT",
      badgeStyle: "solid",
      defaults: {
        title: "É hoje. É agora. É seu.",
        description: "Liberado por tempo limitado.",
        ctaText: "Pegar o meu",
        imageUrl: U("1542291026-7eec264c27ff"),
      },
    },
  },
];

export function findBuiltInById(id: string | null | undefined) {
  if (!id) return null;
  return BUILTIN_AD_TEMPLATES.find((t) => t.id === id) ?? null;
}
