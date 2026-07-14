import { createRoot } from "react-dom/client";
import { toPng, toJpeg } from "html-to-image";
import { AdDoc } from "./layerTypes";
import { LayerRenderer } from "./LayerRenderer";

export type ExportFormat = "png" | "jpeg";

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Renderiza a página em escala 1:1 num container off-screen e exporta como dataURL.
 */
export async function exportPage(
  page: AdDoc,
  format: ExportFormat = "png",
  opts: { pixelRatio?: number; quality?: number } = {},
): Promise<string> {
  const pixelRatio = opts.pixelRatio ?? 2;
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-99999px;top:0;pointer-events:none;opacity:1;";
  document.body.appendChild(host);

  const stage = document.createElement("div");
  const bg = page.backgroundImage
    ? `url(${page.backgroundImage}) center/cover no-repeat, ${page.background}`
    : page.background;
  stage.style.cssText = `width:${page.width}px;height:${page.height}px;position:relative;background:${bg};overflow:hidden;`;
  host.appendChild(stage);

  const root = createRoot(stage);
  root.render(
    <>
      {page.layers.map((l) => (
        <LayerRenderer key={l.id} layer={l} />
      ))}
    </>,
  );

  // Aguarda fontes e imagens carregarem
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* noop */
  }
  await Promise.all(
    Array.from(stage.querySelectorAll("img")).map(
      (img) =>
        new Promise<void>((resolve) => {
          if ((img as HTMLImageElement).complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );

  const common = {
    width: page.width,
    height: page.height,
    pixelRatio,
    cacheBust: true,
    backgroundColor: format === "jpeg" ? "#ffffff" : undefined,
  } as const;

  let dataUrl: string;
  try {
    dataUrl =
      format === "jpeg"
        ? await toJpeg(stage, { ...common, quality: opts.quality ?? 0.92 })
        : await toPng(stage, common);
  } finally {
    root.unmount();
    host.remove();
  }
  return dataUrl;
}
