import { memo } from "react";
import { Smartphone, Tablet, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdDraftState } from "./adCreator.schema";
import { AdEditableSurface, type AdOverrides, type SlotKey } from "./AdEditableSurface";
import type { AdTemplatePayload } from "./adTemplatesLibrary";
import { AdDocPreview } from "./editor/AdDocPreview";
import type { AdDoc } from "./editor/layerTypes";

type Device = "mobile" | "tablet" | "desktop";

const FRAME_W: Record<Device, string> = {
  mobile: "max-w-[360px]",
  tablet: "max-w-[640px]",
  desktop: "max-w-full",
};

const FRAME_RATIO: Record<Device, string> = {
  mobile: "aspect-[9/14]",
  tablet: "aspect-[4/5]",
  desktop: "aspect-[16/9]",
};

interface Props {
  draft: AdDraftState;
  device: Device;
  onDeviceChange: (d: Device) => void;
  editing?: boolean;
  selectedSlot?: SlotKey | null;
  onSelectSlot?: (slot: SlotKey) => void;
  onChangeOverride?: (slot: SlotKey, value: { dx: number; dy: number; scale: number }) => void;
}

export const AdLivePreview = memo(function AdLivePreview({
  draft,
  device,
  onDeviceChange,
  editing,
  selectedSlot,
  onSelectSlot,
  onChangeOverride,
}: Props) {
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
  const overrides = (draft.templatePayload?.overrides as AdOverrides | undefined) ?? undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit mx-auto">
        {(
          [
            { v: "mobile", icon: Smartphone, label: "Mobile" },
            { v: "tablet", icon: Tablet, label: "Tablet" },
            { v: "desktop", icon: Monitor, label: "Desktop" },
          ] as const
        ).map(({ v, icon: Icon, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => onDeviceChange(v)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              device === v
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={device === v}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "mx-auto rounded-2xl border-2 bg-muted/30 p-2 transition-all",
          editing ? "border-primary shadow-[0_0_0_3px_rgba(236,72,153,0.15)]" : "border-border",
          FRAME_W[device],
        )}
        style={{ contain: "content" }}
      >
        <div className={cn("w-full overflow-hidden rounded-xl bg-card border border-border/60", FRAME_RATIO[device])}>
          {draft.templatePayload?.doc ? (
            <AdDocPreview doc={draft.templatePayload.doc as AdDoc} />
          ) : (
            <AdEditableSurface
              data={{
                title: draft.content.title,
                description: draft.content.description,
                ctaText: draft.content.ctaText,
                imageUrl: draft.media.imageUrl,
                payload,
              }}
              device={device}
              overrides={overrides}
              editing={editing}
              selectedSlot={selectedSlot}
              onSelect={onSelectSlot}
              onChange={onChangeOverride}
            />
          )}
        </div>
      </div>
      {editing && (
        <p className="text-[11px] text-center text-muted-foreground">
          Arraste o título, descrição ou CTA. As posições são salvas <strong>por dispositivo</strong>.
        </p>
      )}
    </div>
  );
});
