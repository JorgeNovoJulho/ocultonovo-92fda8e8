import QRCode from "qrcode";

/** Gera um data URL PNG de um QR Code. */
export async function generateQrDataUrl(
  text: string,
  opts: { color?: string; background?: string; size?: number } = {},
): Promise<string> {
  const size = opts.size ?? 512;
  return await QRCode.toDataURL(text || " ", {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: {
      dark: opts.color ?? "#000000",
      light: opts.background ?? "#ffffff",
    },
  });
}
