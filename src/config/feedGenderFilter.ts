/**
 * Filtro global de gênero do feed.
 *
 * 4 categorias visíveis ao usuário:
 *   - homem      → Homens
 *   - mulher     → Mulheres
 *   - casal      → Casais Ele/Ela (heterossexuais)
 *   - lgbtqia    → LGBTQIA+ (outros: gay, lésbica, trans, casais Ele/Ele e Ela/Ela,
 *                            crossdresser, travesti, transexual, etc.)
 */

import { User as Mars, UserRound as Venus, HeartHandshake, Rainbow, type LucideIcon } from "lucide-react";

export const FEED_GENDER_CATEGORIES = ["homem", "mulher", "casal", "lgbtqia"] as const;
export type FeedGenderCategory = (typeof FEED_GENDER_CATEGORIES)[number];

export interface FeedGenderCategoryDef {
  key: FeedGenderCategory;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  /** Classe Tailwind de cor temática do ícone/destaque. */
  accent: string;
}

export const FEED_GENDER_CATEGORY_DEFS: FeedGenderCategoryDef[] = [
  {
    key: "homem",
    label: "Homens",
    shortLabel: "Homens",
    description: "Perfis cadastrados como Homem.",
    icon: Mars,
    accent: "text-sky-400",
  },
  {
    key: "mulher",
    label: "Mulheres",
    shortLabel: "Mulheres",
    description: "Perfis cadastrados como Mulher.",
    icon: Venus,
    accent: "text-pink-400",
  },
  {
    key: "casal",
    label: "Casais Ele/Ela",
    shortLabel: "Casais",
    description: "Casais heterossexuais (Ele/Ela).",
    icon: HeartHandshake,
    accent: "text-rose-400",
  },
  {
    key: "lgbtqia",
    label: "LGBTQIA+ (outros)",
    shortLabel: "LGBTQIA+",
    description: "Gays, lésbicas, trans, casais Ele/Ele e Ela/Ela, crossdressers, travestis e demais identidades.",
    icon: Rainbow,
    accent: "text-fuchsia-400",
  },
];

const norm = (s?: string | null) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Mapa de termos canônicos para cada categoria "definida".
 * Tudo que NÃO bater em homem/mulher/casal e tiver gênero preenchido cai em "lgbtqia".
 */
const TOKENS: Record<Exclude<FeedGenderCategory, "lgbtqia">, string[]> = {
  homem: ["homem", "male", "man", "m", "masculino", "h"],
  mulher: ["mulher", "female", "woman", "f", "feminino", "w"],
  casal: [
    "casal",
    "casal ele/ela",
    "casal_ele_ela",
    "casal ele ela",
    "casal_heterossexual",
    "casal heterossexual",
    "casal hetero",
    "casal_hetero",
    "couple",
    "couple_hetero",
  ],
};

/** Tokens que indicam claramente categoria LGBTQIA+ (casais homo / trans / etc). */
const LGBTQIA_HINTS = [
  "gay",
  "lesbica",
  "lésbica",
  "lesbian",
  "trans",
  "transexual",
  "transgenero",
  "travesti",
  "crossdresser",
  "drag",
  "nao binario",
  "nao-binario",
  "non binary",
  "non-binary",
  "queer",
  "casal_ele_ele",
  "casal ele/ele",
  "casal ele ele",
  "casal_ela_ela",
  "casal ela/ela",
  "casal ela ela",
  "homem_trans",
  "homem trans",
  "mulher_trans",
  "mulher trans",
];

/**
 * Classifica um gênero bruto numa das 4 categorias. Retorna null se não houver
 * gênero preenchido (perfil sem dado — tratado com leniência opcional pelo caller).
 */
export function classifyGender(raw?: string | null): FeedGenderCategory | null {
  const g = norm(raw);
  if (!g) return null;

  // LGBTQIA+ tem precedência sobre 'casal' (ex.: "casal_ele_ele" não é casal hetero).
  for (const t of LGBTQIA_HINTS) {
    const n = norm(t);
    if (g === n || g.includes(n)) return "lgbtqia";
  }

  for (const cat of ["homem", "mulher", "casal"] as const) {
    for (const t of TOKENS[cat]) {
      const n = norm(t);
      if (!n) continue;
      // Tokens curtos (1-2 chars) exigem match exato; longos aceitam substring.
      if (n.length <= 2 ? g === n : g === n || g.includes(n) || n.includes(g)) {
        return cat;
      }
    }
  }

  return "lgbtqia";
}

export interface MatchOptions {
  /** Se true, perfis sem gênero passam pelo filtro (default true — leniência). */
  allowUnknown?: boolean;
}

/**
 * Verifica se um perfil (gênero bruto) deve aparecer no feed dada a seleção do usuário.
 * - selected vazio/null  → mostrar tudo (sem filtro)
 * - todas as categorias  → mostrar tudo
 * - gênero desconhecido  → respeita allowUnknown (default true)
 */
export function matchesSelectedCategories(
  rawGender: string | null | undefined,
  selected: FeedGenderCategory[] | null | undefined,
  options: MatchOptions = {},
): boolean {
  const { allowUnknown = true } = options;
  if (!selected || selected.length === 0) return true;
  if (selected.length >= FEED_GENDER_CATEGORIES.length) return true;
  const cls = classifyGender(rawGender);
  if (!cls) return allowUnknown;
  return selected.includes(cls);
}

/** Normaliza valores vindos do banco (filtra ruído). */
export function sanitizeCategories(input: unknown): FeedGenderCategory[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(FEED_GENDER_CATEGORIES);
  return Array.from(
    new Set(input.filter((v): v is string => typeof v === "string" && allowed.has(v))),
  ) as FeedGenderCategory[];
}
