/**
 * exportAdPreview — gera uma única imagem PNG com os 3 previews
 * (mobile / tablet / desktop) lado a lado, para revisão rápida.
 *
 * Implementação puramente em canvas, sem html2canvas (mantendo o app leve).
 *
 * API:
 *  • generateAdPreviewImage(ad) -> { blob, dataUrl, width, height }
 *  • downloadBlob(blob, filename)
 *  • copyImageBlobToClipboard(blob) -> boolean
 *  • exportAdPreviewImage(ad, filename)  // mantido p/ compatibilidade
 */

interface AdSnapshot {
  title: string;
  description?: string;
  ctaText: string;
  imageUrl?: string;
  accent?: string;
  badge?: string;
}

export interface GeneratedPreview {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

const DEVICE_WIDTHS = { mobile: 360, tablet: 640, desktop: 960 } as const;
type DeviceKey = keyof typeof DEVICE_WIDTHS;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current);
      current = w;
      if (lines.length === maxLines - 1) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxWidth && last.length) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last + "…";
  }
  return lines;
}

async function drawDeviceCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  ad: AdSnapshot,
  device: DeviceKey,
  imgEl: HTMLImageElement | null,
): Promise<number> {
  const accent = ad.accent || "#ec4899";
  const padding = 12;
  const headerH = 32;
  const imgH = Math.round(width * (9 / 16));

  ctx.fillStyle = "#64748b";
  ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(device.toUpperCase(), x, y + 12);
  const cardY = y + 22;
  const cardX = x;
  const cardW = width;

  ctx.fillStyle = "#0a0a0a";
  roundRect(ctx, cardX, cardY, cardW, headerH + imgH + 110, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, headerH + imgH + 110, 14);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, cardX, cardY, cardW, headerH, 14);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cardX + padding + 4, cardY + headerH / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
  ctx.fillText("PATROCINADO", cardX + padding + 16, cardY + headerH / 2 + 4);

  if (ad.badge) {
    ctx.fillStyle = accent;
    const badgeW = ctx.measureText(ad.badge).width + 14;
    roundRect(ctx, cardX + cardW - badgeW - padding, cardY + 8, badgeW, 16, 4);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ad.badge.toUpperCase(), cardX + cardW - badgeW / 2 - padding, cardY + 19);
    ctx.textAlign = "left";
  }

  const imgY = cardY + headerH;
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(cardX, imgY, cardW, imgH);
  if (imgEl) {
    const scale = Math.max(cardW / imgEl.width, imgH / imgEl.height);
    const sw = cardW / scale;
    const sh = imgH / scale;
    const sx = (imgEl.width - sw) / 2;
    const sy = (imgEl.height - sh) / 2;
    ctx.drawImage(imgEl, sx, sy, sw, sh, cardX, imgY, cardW, imgH);
  } else {
    ctx.fillStyle = "#475569";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Sem imagem", cardX + cardW / 2, imgY + imgH / 2);
    ctx.textAlign = "left";
  }

  let ty = imgY + imgH + 18;
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 15px system-ui, -apple-system, sans-serif";
  const titleLines = wrapText(ctx, ad.title || "Título do anúncio", cardW - padding * 2, 2);
  titleLines.forEach((ln) => {
    ctx.fillText(ln, cardX + padding, ty);
    ty += 18;
  });

  if (ad.description) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui";
    const descLines = wrapText(ctx, ad.description, cardW - padding * 2, 2);
    descLines.forEach((ln) => {
      ctx.fillText(ln, cardX + padding, ty);
      ty += 15;
    });
  }

  ty += 6;
  const ctaText = ad.ctaText || "Saiba mais";
  ctx.font = "bold 12px system-ui";
  const btnW = ctx.measureText(ctaText).width + 28;
  ctx.fillStyle = accent;
  roundRect(ctx, cardX + padding, ty, btnW, 28, 6);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(ctaText, cardX + padding + btnW / 2, ty + 18);
  ctx.textAlign = "left";

  return headerH + imgH + 110 + 22;
}

export async function generateAdPreviewImage(ad: AdSnapshot): Promise<GeneratedPreview> {
  const padding = 24;
  const gap = 20;
  const totalW =
    padding * 2 + DEVICE_WIDTHS.mobile + DEVICE_WIDTHS.tablet + DEVICE_WIDTHS.desktop + gap * 2;
  const cardH = 340;
  const headerH = 70;
  const totalH = padding * 2 + headerH + cardH;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = totalW * dpr;
  canvas.height = totalH * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador");
  ctx.scale(dpr, dpr);

  const grad = ctx.createLinearGradient(0, 0, 0, totalH);
  grad.addColorStop(0, "#1e1b4b");
  grad.addColorStop(1, "#0f172a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, totalW, totalH);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("Preview do anúncio · revisão multi-device", padding, padding + 22);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px system-ui";
  ctx.fillText(`Gerado em ${new Date().toLocaleString("pt-BR")}`, padding, padding + 42);

  const imgEl = ad.imageUrl ? await loadImage(ad.imageUrl) : null;

  let cx = padding;
  const cy = padding + headerH;
  const devices: DeviceKey[] = ["mobile", "tablet", "desktop"];
  for (const d of devices) {
    await drawDeviceCard(ctx, cx, cy, DEVICE_WIDTHS[d], ad, d, imgEl);
    cx += DEVICE_WIDTHS[d] + gap;
  }

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG"))), "image/png"),
  );
  const dataUrl = canvas.toDataURL("image/png");
  return { blob, dataUrl, width: canvas.width, height: canvas.height };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copia PNG para a área de transferência. Retorna true em sucesso. */
export async function copyImageBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Compatibilidade: gera + baixa em um só passo. */
export async function exportAdPreviewImage(ad: AdSnapshot, filename = "ad-preview.png") {
  const { blob } = await generateAdPreviewImage(ad);
  downloadBlob(blob, filename);
}
