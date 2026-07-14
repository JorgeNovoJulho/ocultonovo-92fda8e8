/**
 * Aplica marca d'água em uma imagem (canvas client-side).
 * Para vídeos, retorna metadata para overlay no player.
 */

export interface WatermarkOptions {
  channelName: string;
  username: string;
  date?: string; // dd/MM/yyyy
}

function formatDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export async function applyImageWatermark(
  file: File | Blob,
  opts: WatermarkOptions
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });

    const maxW = 1920;
    const scale = img.width > maxW ? maxW / img.width : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);

    const date = opts.date ?? formatDate();
    const lines = [
      opts.channelName,
      `@${opts.username}`,
      "OCULTO",
      date,
    ].filter(Boolean);

    const fontSize = Math.max(14, Math.round(w / 38));
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    // Tile diagonal pattern
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    const stepY = fontSize * 6;
    const stepX = Math.max(...lines.map((l) => ctx.measureText(l).width)) + fontSize * 4;
    const blockH = lines.length * (fontSize + 4);

    for (let y = -h; y < h; y += stepY) {
      for (let x = -w; x < w; x += stepX) {
        lines.forEach((line, idx) => {
          const yy = y + idx * (fontSize + 4) - blockH / 2;
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillText(line, x + 1, yy + 1);
          ctx.fillStyle = "rgba(255,255,255,0.32)";
          ctx.fillText(line, x, yy);
        });
      }
    }
    ctx.restore();

    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/webp", 0.88)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function buildWatermarkMeta(opts: WatermarkOptions) {
  return {
    channel: opts.channelName,
    username: opts.username,
    platform: "OCULTO",
    date: opts.date ?? formatDate(),
  };
}
