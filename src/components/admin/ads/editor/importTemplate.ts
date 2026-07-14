import { AdDoc, defaultImageLayer, emptyDoc } from "./layerTypes";

/** Extensões aceitas no input file picker. */
export const IMPORT_ACCEPT =
  ".json,.adtemplate,.adtemplate.json,application/json,image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg";

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i;

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("read error"));
    r.readAsText(file);
  });
}
function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("read error"));
    r.readAsDataURL(file);
  });
}
function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1080, h: img.naturalHeight || 1350 });
    img.onerror = () => resolve({ w: 1080, h: 1350 });
    img.src = src;
  });
}

/** Normaliza um objeto desconhecido em AdDoc se possível. */
function coerceAdDoc(raw: any): AdDoc | null {
  if (!raw || typeof raw !== "object") return null;
  // Caso 1: já é um AdDoc
  if (Array.isArray(raw.layers) && typeof raw.width === "number" && typeof raw.height === "number") {
    return raw as AdDoc;
  }
  // Caso 2: payload de template { doc: AdDoc } (formato salvo na DB)
  if (raw.doc && Array.isArray(raw.doc.layers)) return raw.doc as AdDoc;
  // Caso 3: payload com { pages: AdDoc[] }
  if (Array.isArray(raw.pages) && raw.pages[0]?.layers) {
    const [first, ...rest] = raw.pages;
    return { ...first, pages: rest } as AdDoc;
  }
  return null;
}

/**
 * Importa um arquivo de template e retorna um AdDoc pronto para `loadDoc`.
 * Suporta:
 *  - JSON nativo (AdDoc, payload de template, ou { pages: [...] })
 *  - Imagens (PNG/JPG/WEBP/GIF/SVG) → vira um doc com a imagem como background,
 *    usando a resolução natural da imagem (cap. 4096px).
 */
export async function importTemplateFile(file: File): Promise<AdDoc> {
  const name = file.name.toLowerCase();
  const isJson = file.type === "application/json" || name.endsWith(".json") || name.endsWith(".adtemplate");
  if (isJson) {
    const text = await readAsText(file);
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Arquivo JSON inválido");
    }
    const doc = coerceAdDoc(parsed);
    if (!doc) throw new Error("JSON não reconhecido como template");
    return doc;
  }

  if (IMAGE_MIME.test(file.type) || /\.(png|jpe?g|webp|gif|svg)$/i.test(name)) {
    const dataUrl = await readAsDataURL(file);
    const { w, h } = await loadImageSize(dataUrl);
    const cap = 4096;
    const scale = Math.min(1, cap / Math.max(w, h));
    const width = Math.round(w * scale);
    const height = Math.round(h * scale);
    const base = emptyDoc(width, height);
    base.backgroundImage = dataUrl;
    base.background = "#000000";
    // Camada de imagem opcional permite reposicionar — mas como background já cobre,
    // mantemos apenas o background para arquivos leves.
    return base;
  }

  throw new Error(`Formato não suportado: ${file.name}`);
}

/** Abre seletor de arquivos e devolve o AdDoc importado (ou null se cancelado). */
export function pickAndImportTemplate(): Promise<AdDoc | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMPORT_ACCEPT;
    input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      try {
        const doc = await importTemplateFile(file);
        resolve(doc);
      } catch (e) {
        reject(e);
      }
    };
    document.body.appendChild(input);
    input.click();
  });
}

// Re-export para uso fora se quiserem criar layer ao invés de bg
export { defaultImageLayer };
