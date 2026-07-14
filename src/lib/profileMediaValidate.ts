// Validação leve de mídia para avatar/banner — evita crashes em mobile

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

// Limite generoso (15MB) — acima disso o canvas mobile costuma travar
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type MediaValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateProfileImage(file: File | null | undefined): MediaValidationResult {
  if (!file) return { ok: false, reason: "Nenhum arquivo selecionado." };

  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const looksLikeImage =
    type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif)$/i.test(name);

  if (!looksLikeImage) {
    return { ok: false, reason: "Formato inválido. Envie JPG, PNG, WEBP ou GIF." };
  }

  if (type && !ALLOWED_IMAGE_TYPES.includes(type) && !/\.(jpe?g|png|webp|gif)$/i.test(name)) {
    return { ok: false, reason: "Formato não suportado. Use JPG, PNG, WEBP ou GIF." };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `Imagem muito grande (${mb}MB). Máximo 15MB.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, reason: "Arquivo vazio ou corrompido." };
  }

  return { ok: true };
}

// Detecta se o canvas 2D está disponível e funcional
export function canUseCanvas(): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 4;
    const ctx = c.getContext("2d");
    return !!ctx;
  } catch {
    return false;
  }
}
