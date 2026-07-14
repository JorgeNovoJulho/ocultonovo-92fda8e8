import { z } from "zod";

export const MIN_VIDEO_DOWNLOAD_PRICE = 1;
export const MAX_VIDEO_DOWNLOAD_PRICE = 999.99;

export const paidVideoDownloadPriceSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const raw = value.trim();
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    return normalized === "" ? NaN : Number(normalized);
  },
  z
    .number({ invalid_type_error: "Informe um valor em R$ para o download." })
    .finite("Informe um valor válido em R$.")
    .min(MIN_VIDEO_DOWNLOAD_PRICE, `O valor mínimo é R$ ${MIN_VIDEO_DOWNLOAD_PRICE.toFixed(2).replace(".", ",")}.`)
    .max(MAX_VIDEO_DOWNLOAD_PRICE, `O valor máximo é R$ ${MAX_VIDEO_DOWNLOAD_PRICE.toFixed(2).replace(".", ",")}.`)
);

export function validatePaidVideoDownloadPrice(value: string) {
  return paidVideoDownloadPriceSchema.safeParse(value);
}

export function formatCurrencyBR(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function isVideoMedia(mediaType?: string | null, mediaUrl?: string | null) {
  return mediaType === "video" || !!mediaUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);
}
