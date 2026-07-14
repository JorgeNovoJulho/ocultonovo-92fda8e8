// Catálogo curado de Google Fonts para o editor visual de anúncios.
// Injeta <link> só quando a fonte é usada — sem peso desnecessário.

export interface FontDef {
  family: string;
  weights: number[];
  category: "sans" | "serif" | "display" | "mono" | "handwriting";
  label?: string;
}

export const FONT_CATALOG: FontDef[] = [
  // Sans modernas
  { family: "Inter", weights: [400, 600, 700, 800, 900], category: "sans" },
  { family: "Poppins", weights: [400, 600, 700, 800, 900], category: "sans" },
  { family: "Montserrat", weights: [400, 700, 800, 900], category: "sans" },
  { family: "Raleway", weights: [400, 700, 900], category: "sans" },
  { family: "Work Sans", weights: [400, 600, 800], category: "sans" },
  { family: "Space Grotesk", weights: [400, 600, 700], category: "sans" },
  { family: "DM Sans", weights: [400, 700], category: "sans" },
  { family: "Manrope", weights: [400, 700, 800], category: "sans" },
  { family: "Outfit", weights: [400, 700, 900], category: "sans" },
  { family: "Sora", weights: [400, 700, 800], category: "sans" },
  { family: "Plus Jakarta Sans", weights: [400, 700, 800], category: "sans" },
  { family: "Figtree", weights: [400, 700, 900], category: "sans" },
  { family: "Urbanist", weights: [400, 700, 900], category: "sans" },
  { family: "Epilogue", weights: [400, 700, 900], category: "sans" },
  { family: "Barlow", weights: [400, 700, 900], category: "sans" },
  { family: "Hind", weights: [400, 700], category: "sans" },
  { family: "Nunito", weights: [400, 700, 900], category: "sans" },
  { family: "Nunito Sans", weights: [400, 700, 900], category: "sans" },
  { family: "Rubik", weights: [400, 700, 900], category: "sans" },
  { family: "Karla", weights: [400, 700], category: "sans" },
  { family: "Cabin", weights: [400, 700], category: "sans" },
  { family: "Fira Sans", weights: [400, 700, 900], category: "sans" },
  { family: "IBM Plex Sans", weights: [400, 700], category: "sans" },
  { family: "Syne", weights: [400, 700, 800], category: "sans" },
  // Display impactantes
  { family: "Bebas Neue", weights: [400], category: "display" },
  { family: "Anton", weights: [400], category: "display" },
  { family: "Archivo Black", weights: [400], category: "display" },
  { family: "Oswald", weights: [400, 600, 700], category: "display" },
  { family: "Abril Fatface", weights: [400], category: "display" },
  { family: "Bungee", weights: [400], category: "display" },
  { family: "Bungee Shade", weights: [400], category: "display" },
  { family: "Russo One", weights: [400], category: "display" },
  { family: "Black Ops One", weights: [400], category: "display" },
  { family: "Audiowide", weights: [400], category: "display" },
  { family: "Orbitron", weights: [400, 700, 900], category: "display" },
  { family: "Righteous", weights: [400], category: "display" },
  { family: "Staatliches", weights: [400], category: "display" },
  { family: "Alfa Slab One", weights: [400], category: "display" },
  { family: "Fjalla One", weights: [400], category: "display" },
  { family: "Monoton", weights: [400], category: "display" },
  { family: "Faster One", weights: [400], category: "display" },
  { family: "Press Start 2P", weights: [400], category: "display" },
  { family: "Bowlby One", weights: [400], category: "display" },
  // Serifs elegantes
  { family: "Playfair Display", weights: [400, 700, 900], category: "serif" },
  { family: "Cormorant Garamond", weights: [400, 700], category: "serif" },
  { family: "DM Serif Display", weights: [400], category: "serif" },
  { family: "Lora", weights: [400, 700], category: "serif" },
  { family: "Instrument Serif", weights: [400], category: "serif" },
  { family: "Libre Baskerville", weights: [400, 700], category: "serif" },
  { family: "Crimson Text", weights: [400, 700], category: "serif" },
  { family: "Merriweather", weights: [400, 700, 900], category: "serif" },
  { family: "EB Garamond", weights: [400, 700], category: "serif" },
  { family: "Spectral", weights: [400, 700], category: "serif" },
  { family: "Bodoni Moda", weights: [400, 700, 900], category: "serif" },
  { family: "Italiana", weights: [400], category: "serif" },
  // Handwriting / Script
  { family: "Permanent Marker", weights: [400], category: "handwriting" },
  { family: "Caveat", weights: [400, 700], category: "handwriting" },
  { family: "Pacifico", weights: [400], category: "handwriting" },
  { family: "Great Vibes", weights: [400], category: "handwriting" },
  { family: "Dancing Script", weights: [400, 700], category: "handwriting" },
  { family: "Satisfy", weights: [400], category: "handwriting" },
  { family: "Sacramento", weights: [400], category: "handwriting" },
  { family: "Allura", weights: [400], category: "handwriting" },
  { family: "Kaushan Script", weights: [400], category: "handwriting" },
  { family: "Shadows Into Light", weights: [400], category: "handwriting" },
  { family: "Indie Flower", weights: [400], category: "handwriting" },
  { family: "Amatic SC", weights: [400, 700], category: "handwriting" },
  { family: "Homemade Apple", weights: [400], category: "handwriting" },
  // Mono
  { family: "JetBrains Mono", weights: [400, 700], category: "mono" },
  { family: "Space Mono", weights: [400, 700], category: "mono" },
  { family: "Fira Code", weights: [400, 700], category: "mono" },
  { family: "IBM Plex Mono", weights: [400, 700], category: "mono" },
  { family: "Roboto Mono", weights: [400, 700], category: "mono" },
];

const loaded = new Set<string>();

export function ensureFont(family: string) {
  if (typeof document === "undefined") return;
  if (loaded.has(family)) return;
  const def = FONT_CATALOG.find((f) => f.family === family);
  if (!def) {
    loaded.add(family);
    return;
  }
  const id = `gfont-${family.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) {
    loaded.add(family);
    return;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  const weights = def.weights.join(";");
  const fam = family.replace(/\s+/g, "+");
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights}&display=swap`;
  document.head.appendChild(link);
  loaded.add(family);
}

export function preloadFonts(families: string[]) {
  families.forEach(ensureFont);
}
