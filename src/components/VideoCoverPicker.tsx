import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoCoverPickerProps {
  videoFile?: File;
  videoUrl?: string;
  onCoverSelected: (url: string, blob: Blob) => void;
  selectedCoverUrl?: string | null;
}

const FRAME_COUNT = 6;
const MAX_W = 480;

const getReliableDuration = (video: HTMLVideoElement): Promise<number> =>
  new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Não foi possível ler a duração do vídeo"));
    };

    const tryResolve = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) finish(duration);
    };

    const onLoadedMetadata = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        finish(duration);
        return;
      }

      try {
        video.currentTime = 1e9;
      } catch {
        fail();
      }
    };

    const onDurationChange = () => tryResolve();
    const onSeeked = () => tryResolve();
    const onError = () => fail();

    const timeoutId = window.setTimeout(() => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) finish(duration);
      else fail();
    }, 12000);

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);

    if (video.readyState >= 1) onLoadedMetadata();
  });

/**
 * Permite escolher um frame do vídeo como capa.
 * Gera N thumbnails distribuídos ao longo da duração + opção de "frame atual".
 * Otimizado para Realme C55: canvas 480px max, .webp 0.7 quality.
 */
export function VideoCoverPicker({ videoFile, videoUrl, onCoverSelected, selectedCoverUrl }: VideoCoverPickerProps) {
  const [frames, setFrames] = useState<{ time: number; url: string; blob: Blob }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const onCoverSelectedRef = useRef(onCoverSelected);

  useEffect(() => {
    onCoverSelectedRef.current = onCoverSelected;
  }, [onCoverSelected]);

  const captureFrame = useCallback((video: HTMLVideoElement, time: number): Promise<{ url: string; blob: Blob }> => {
    return new Promise((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        try {
          const canvas = document.createElement("canvas");
          let w = video.videoWidth || MAX_W;
          let h = video.videoHeight || MAX_W;
          if (w > MAX_W) {
            h = Math.round(h * (MAX_W / w));
            w = MAX_W;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas ctx fail"));
          ctx.drawImage(video, 0, 0, w, h);
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error("toBlob fail"));
              const url = URL.createObjectURL(blob);
              objectUrlsRef.current.push(url);
              resolve({ url, blob });
            },
            "image/webp",
            0.7
          );
        } catch (error) {
          reject(error);
        }
      };

      video.addEventListener("seeked", onSeeked);
      try {
        video.currentTime = Math.max(0.01, Math.min(time, (video.duration || 1) - 0.01));
      } catch {
        video.removeEventListener("seeked", onSeeked);
        reject(new Error("seek fail"));
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFrames([]);
    setSelectedTime(null);
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];

    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const fileUrl = videoUrl || (videoFile ? URL.createObjectURL(videoFile) : "");
    video.src = fileUrl;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      if (!videoUrl && fileUrl) URL.revokeObjectURL(fileUrl);
    };

    const generate = async () => {
      try {
        const duration = await getReliableDuration(video);
        if (cancelled) return;

        const times = Array.from({ length: FRAME_COUNT }, (_, i) => (duration / (FRAME_COUNT + 1)) * (i + 1));
        const collected: { time: number; url: string; blob: Blob }[] = [];

        for (const time of times) {
          if (cancelled) break;
          try {
            const frame = await captureFrame(video, time);
            collected.push({ time, ...frame });
            if (!cancelled) setFrames([...collected]);
          } catch {
            // ignora frame com falha
          }
        }

        if (!cancelled) {
          setLoading(false);
          if (collected[0] && !selectedCoverUrl) {
            setSelectedTime(collected[0].time);
            onCoverSelectedRef.current(collected[0].url, collected[0].blob);
          }
        }
      } catch {
        if (!cancelled) setLoading(false);
      } finally {
        cleanup();
      }
    };

    void generate();

    return () => {
      cancelled = true;
      cleanup();
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, [videoFile, videoUrl, selectedCoverUrl, captureFrame]);

  const handleSelect = (frame: { time: number; url: string; blob: Blob }) => {
    setSelectedTime(frame.time);
    onCoverSelectedRef.current(frame.url, frame.blob);
  };

  const handleUploadCustom = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    setSelectedTime(-1);
    onCoverSelectedRef.current(url, file);
    event.target.value = "";
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Escolher capa do vídeo</p>
        </div>
        <label>
          <input
            type="file"
            accept="image/*"
            onChange={handleUploadCustom}
            className="hidden"
          />
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <span className="cursor-pointer">Enviar imagem</span>
          </Button>
        </label>
      </div>

      {loading && frames.length === 0 ? (
        <div className="flex h-20 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Gerando miniaturas...
        </div>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {frames.map((frame) => {
            const isSelected = selectedTime === frame.time;
            return (
              <button
                key={frame.time}
                type="button"
                onClick={() => handleSelect(frame)}
                className={cn(
                  "relative shrink-0 overflow-hidden rounded-md border-2 transition-all",
                  isSelected
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border/40 hover:border-primary/60"
                )}
                style={{ width: 80, height: 60 }}
              >
                <img loading="lazy" decoding="async" src={frame.url} alt="frame" className="h-full w-full object-cover" />
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
                    <Check className="h-5 w-5 text-primary-foreground drop-shadow" />
                  </div>
                )}
              </button>
            );
          })}
          {loading && (
            <div className="flex shrink-0 items-center justify-center" style={{ width: 80, height: 60 }}>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Toque em um frame para definir a capa exibida no feed.
      </p>
    </div>
  );
}
