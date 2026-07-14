/**
 * AdFullscreenPreview — modal de revisão em tela cheia.
 * Alterna mobile/tablet/desktop e tem slider de zoom (50% a 200%).
 * Renderiza o mesmo AdTemplateRenderer do preview/galeria para fidelidade total.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Smartphone, Tablet, Monitor, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdTemplateRenderer } from "./AdTemplateRenderer";
import type { AdDraftState } from "./adCreator.schema";
import type { AdTemplatePayload } from "./adTemplatesLibrary";

type Device = "mobile" | "tablet" | "desktop";

const DEVICE_DIM: Record<Device, { w: number; h: number; label: string }> = {
  mobile:  { w: 360, h: 640, label: "Mobile" },
  tablet:  { w: 768, h: 960, label: "Tablet" },
  desktop: { w: 1280, h: 720, label: "Desktop" },
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: AdDraftState;
}

export function AdFullscreenPreview({ open, onOpenChange, draft }: Props) {
  const [device, setDevice] = useState<Device>("mobile");
  const [zoom, setZoom] = useState(100);

  const dim = DEVICE_DIM[device];
  const payload: AdTemplatePayload = {
    variant: (draft.templatePayload?.variant as any) || "classic",
    accent: (draft.templatePayload?.accent as string) || "#ec4899",
    bg: draft.templatePayload?.bg as string | undefined,
    gradient: draft.templatePayload?.gradient as string | undefined,
    badge: draft.templatePayload?.badge as string | undefined,
    badgeStyle: (draft.templatePayload?.badgeStyle as any) || "solid",
    titleFont: (draft.templatePayload?.titleFont as any) || "sans",
    textOnDark: !!draft.templatePayload?.textOnDark,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-[100vw] w-screen h-[100dvh] sm:max-w-[100vw] flex flex-col overflow-hidden bg-background/95 backdrop-blur"
      >
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/80">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {(Object.keys(DEVICE_DIM) as Device[]).map((d) => {
              const Icon = d === "mobile" ? Smartphone : d === "tablet" ? Tablet : Monitor;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    device === d
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={device === d}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{DEVICE_DIM[d].label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-xs mx-3">
            <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
            <Slider
              value={[zoom]}
              min={50}
              max={200}
              step={10}
              onValueChange={(v) => setZoom(v[0] ?? 100)}
              className="flex-1"
            />
            <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] tabular-nums w-10 text-right text-muted-foreground">{zoom}%</span>
          </div>

          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Palco */}
        <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_center,hsl(var(--muted))_0%,hsl(var(--background))_70%)] flex items-center justify-center p-4">
          <div
            className="rounded-2xl border-2 border-border bg-card shadow-2xl overflow-hidden transition-transform"
            style={{
              width: dim.w,
              height: dim.h,
              transform: `scale(${zoom / 100})`,
              transformOrigin: "center center",
              contain: "content",
            }}
          >
            <AdTemplateRenderer
              mode="preview"
              data={{
                title: draft.content.title,
                description: draft.content.description,
                ctaText: draft.content.ctaText,
                imageUrl: draft.media.imageUrl,
                payload,
              }}
            />
          </div>
        </div>

        <div className="px-3 py-2 border-t border-border bg-card/80 text-[11px] text-muted-foreground text-center">
          {dim.label} · {dim.w}×{dim.h}px · Zoom {zoom}% — pressione <kbd className="px-1 rounded bg-muted">Esc</kbd> para fechar
        </div>
      </DialogContent>
    </Dialog>
  );
}
