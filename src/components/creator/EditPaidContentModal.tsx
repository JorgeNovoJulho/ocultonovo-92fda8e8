import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Film,
  Image as ImageIcon,
  Loader2,
  Lock,
  Package,
  Upload,
  Video,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { smartImageUpload, smartVideoUpload, validateVideoDuration } from "@/lib/smartUpload";

type SectionKey = "short_video" | "long_video" | "photo" | "photo_pack" | "video_pack";
type BlurLevel = "light" | "medium" | "strong";

type SectionDef = {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accept: string;
  multiple: boolean;
  isVideo: boolean;
  maxDuration?: number;
  hint: string;
};

const SECTION_MAP: Record<SectionKey, SectionDef> = {
  short_video: { key: "short_video", label: "Vídeos curtos", icon: Film, accept: "video/*", multiple: false, isVideo: true, maxDuration: 90, hint: "Vídeo único de até 1m30s" },
  long_video: { key: "long_video", label: "Vídeos longos", icon: Video, accept: "video/*", multiple: false, isVideo: true, maxDuration: 1800, hint: "Vídeo único de até 30 min" },
  photo: { key: "photo", label: "Imagem única", icon: ImageIcon, accept: "image/*", multiple: false, isVideo: false, hint: "1 foto" },
  photo_pack: { key: "photo_pack", label: "Pack de imagens", icon: Package, accept: "image/*", multiple: true, isVideo: false, hint: "2 a 20 fotos" },
  video_pack: { key: "video_pack", label: "Pack de vídeos curtos", icon: Package, accept: "video/*", multiple: true, isVideo: true, maxDuration: 90, hint: "2 a 10 vídeos" },
};

const BLUR_PX: Record<BlurLevel, number> = { light: 14, medium: 22, strong: 36 };

function normalizeBlur(value: any): BlurLevel {
  return value === "light" || value === "strong" ? value : "medium";
}

function inferSection(post: any): SectionKey {
  if (post?.section_type && SECTION_MAP[post.section_type as SectionKey]) return post.section_type as SectionKey;
  const mediaUrls = Array.isArray(post?.media_urls) ? post.media_urls.filter(Boolean) : [];
  const isPack = mediaUrls.length > 1;
  const isVideo = post?.media_type === "video" || /\.(mp4|webm|mov)$/i.test(post?.media_url || "");
  const duration = Number(post?.video_duration_seconds || post?.media_duration_seconds || 0);
  if (isVideo && isPack) return "video_pack";
  if (!isVideo && isPack) return "photo_pack";
  if (isVideo) return duration > 0 && duration <= 90 ? "short_video" : "long_video";
  return "photo";
}

function getExistingMedia(post: any): string[] {
  const urls = Array.isArray(post?.media_urls) ? post.media_urls.filter(Boolean) : [];
  return urls.length > 0 ? urls : post?.media_url ? [post.media_url] : [];
}

interface EditPaidContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: any | null;
  onSaved: () => void;
}

export default function EditPaidContentModal({ open, onOpenChange, post, onSaved }: EditPaidContentModalProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const [sectionKey, setSectionKey] = useState<SectionKey>("photo");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("19.90");
  const [blurLevel, setBlurLevel] = useState<BlurLevel>("medium");
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [previewAsVisitor, setPreviewAsVisitor] = useState(false);
  const [coverFile, setCoverFile] = useState<File | Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [coverChanged, setCoverChanged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  const existingMedia = useMemo(() => getExistingMedia(post), [post]);
  const section = SECTION_MAP[sectionKey];
  const allowedSections = useMemo<SectionDef[]>(() => {
    const inferred = inferSection(post);
    if (inferred === "short_video" || inferred === "long_video") return [SECTION_MAP.short_video, SECTION_MAP.long_video];
    if (inferred === "video_pack") return [SECTION_MAP.video_pack];
    if (inferred === "photo_pack") return [SECTION_MAP.photo_pack];
    return [SECTION_MAP.photo];
  }, [post]);

  const displayedMedia = previews.length > 0 ? previews : existingMedia;
  const canCaptureFrame = section?.isVideo && displayedMedia.length > 0;

  const resetBlobs = () => {
    previews.forEach((url) => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); });
    if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
  };

  useEffect(() => {
    if (!open || !post) return;

    resetBlobs();
    setSectionKey(inferSection(post));
    setTitle(post.content_text || post.title || "");
    setDescription(post.description || "");
    setPrice(String(post.paid_price ?? ""));
    setBlurLevel(normalizeBlur(post.preview_blur));
    setPreviews([]);
    setFiles([]);
    setDurations([]);
    setPreviewAsVisitor(false);
    setCoverFile(null);
    setCoverPreview(post.thumbnail_url || "");
    setCoverChanged(false);
    setSubmitting(false);
    setProgress(0);
    setProgressMsg("");
  }, [open, post?.id]);

  useEffect(() => {
    return () => resetBlobs();
  }, []);

  const split = useMemo(() => {
    const p = parseFloat(price.replace(",", ".")) || 0;
    const tax = +(p * 0.06).toFixed(2);
    const afterTax = p - tax;
    const platform = +(afterTax * 0.2).toFixed(2);
    const affiliate = +(afterTax * 0.05).toFixed(2);
    const creator = +(p - tax - platform - affiliate).toFixed(2);
    const pct = p > 0 ? ((creator / p) * 100).toFixed(1) : "0";
    return { p, tax, platform, affiliate, creator, pct };
  }, [price]);

  const handleClose = (next: boolean) => {
    if (!next) resetBlobs();
    onOpenChange(next);
  };

  const handleFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;

    if (section.multiple && picked.length < 2) {
      toast.error("Selecione pelo menos 2 arquivos para um pack");
      return;
    }
    if (section.key === "photo_pack" && picked.length > 20) {
      toast.error("Máximo 20 fotos no pack");
      return;
    }
    if (section.key === "video_pack" && picked.length > 10) {
      toast.error("Máximo 10 vídeos no pack");
      return;
    }

    const nextDurations: number[] = [];
    if (section.isVideo && section.maxDuration) {
      for (const file of picked) {
        const result = await validateVideoDuration(file, section.maxDuration);
        if (!result.valid) {
          toast.error(`Vídeo "${file.name}" excede ${section.maxDuration}s`);
          return;
        }
        nextDurations.push(Math.round(result.duration));
      }
    }

    previews.forEach((url) => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); });
    setFiles(picked);
    setDurations(nextDurations);
    setPreviews(picked.map((file) => URL.createObjectURL(file)));
  };

  const handleCoverPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      toast.error("A capa deve ser uma imagem");
      return;
    }
    if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    setCoverFile(picked);
    setCoverPreview(URL.createObjectURL(picked));
    setCoverChanged(true);
  };

  const handleCaptureFrame = async () => {
    const video = videoPreviewRef.current;
    if (!video || !video.videoWidth) {
      toast.error("Aguarde o vídeo carregar e pause no frame desejado");
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Falha ao capturar frame"))), "image/jpeg", 0.85)
      );
      if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
      setCoverFile(blob);
      setCoverPreview(URL.createObjectURL(blob));
      setCoverChanged(true);
      toast.success("Frame capturado como capa");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao capturar frame");
    }
  };

  const handleRemoveCover = () => {
    if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview("");
    setCoverChanged(true);
  };

  const handleSave = async () => {
    if (!post?.id || !user?.id) return;

    const priceNum = parseFloat(price.replace(",", "."));
    if (!Number.isFinite(priceNum) || priceNum < 1 || priceNum > 500) {
      toast.error("Valor avulso deve estar entre R$ 1,00 e R$ 500,00");
      return;
    }

    setSubmitting(true);
    setProgress(0);
    setProgressMsg("Salvando alterações...");

    try {
      let uploadedMediaUrls: string[] | null = null;
      let uploadedCoverUrl = coverPreview || null;

      if (files.length > 0) {
        uploadedMediaUrls = [];
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const baseMsg = `Arquivo ${i + 1}/${files.length}`;
          setProgressMsg(`${baseMsg}: enviando...`);

          const result = section.isVideo
            ? await smartVideoUpload(file, user.id, "vip-paid", "post-media", (p) => {
                const fileBase = (i / files.length) * 80;
                const filePart = p.percent / files.length;
                setProgress(Math.round(fileBase + filePart));
                setProgressMsg(`${baseMsg}: ${p.message}`);
              })
            : await smartImageUpload(file, user.id, "vip-paid", "post-media", (p) => {
                const fileBase = (i / files.length) * 80;
                const filePart = p.percent / files.length;
                setProgress(Math.round(fileBase + filePart));
                setProgressMsg(`${baseMsg}: ${p.message}`);
              });

          uploadedMediaUrls.push(result.publicUrl);
        }
      }

      if (section.isVideo && coverChanged) {
        if (coverFile) {
          setProgressMsg("Enviando nova capa...");
          const coverResult = await smartImageUpload(coverFile, user.id, "vip-cover", "post-media", () => {});
          uploadedCoverUrl = coverResult.publicUrl;
        } else {
          uploadedCoverUrl = null;
        }
      }

      setProgress(92);
      setProgressMsg("Atualizando publicação...");

      const updatePayload: any = {
        content_text: title.trim().slice(0, 80) || null,
        description: description.trim().slice(0, 250) || null,
        paid_price: priceNum,
        section_type: section.key,
        preview_blur: blurLevel,
      };

      if (uploadedMediaUrls) {
        updatePayload.media_url = uploadedMediaUrls[0] || null;
        updatePayload.media_urls = section.multiple ? uploadedMediaUrls : null;
        updatePayload.media_type = section.isVideo ? "video" : "image";
        if (section.isVideo) {
          updatePayload.video_duration_seconds = durations[0] || null;
        }
      }

      if (section.isVideo && coverChanged) {
        updatePayload.thumbnail_url = uploadedCoverUrl;
      }

      const { error } = await (supabase as any)
        .from("posts")
        .update(updatePayload)
        .eq("id", post.id);

      if (error) throw error;

      setProgress(100);
      toast.success("Conteúdo atualizado");
      onSaved();
      handleClose(false);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao atualizar conteúdo");
    } finally {
      setSubmitting(false);
    }
  };

  if (!post) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "p-0 gap-0 border-border bg-background",
          "w-screen h-[100dvh] max-w-none rounded-none sm:w-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-lg",
          "flex flex-col overflow-hidden"
        )}
      >
        <DialogHeader className="border-b border-border/60 px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lock className="h-5 w-5 text-amber-400" /> Editar conteúdo publicado
          </DialogTitle>
          <DialogDescription className="text-xs">
            Atualize seção, capa, preço, descrição e intensidade de blur do conteúdo do canal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Seção</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {allowedSections.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setSectionKey(option.key)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        sectionKey === option.key
                          ? "border-amber-400 bg-amber-500/10"
                          : "border-border bg-muted/30 hover:border-amber-400/40"
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 text-amber-400" />
                      <div>
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="text-[11px] text-muted-foreground">{option.hint}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pré-visualização</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewAsVisitor((value) => !value)}
                  className="h-7 gap-1 text-[11px]"
                >
                  {previewAsVisitor ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {previewAsVisitor ? "Ver como criador" : "Testar como visitante"}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {displayedMedia.map((src, index) => (
                  <div key={`${src}-${index}`} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                    {section.isVideo ? (
                      <video
                        ref={index === 0 ? videoPreviewRef : undefined}
                        src={src}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        controls={index === 0 && !previewAsVisitor}
                        crossOrigin="anonymous"
                        preload="metadata"
                        style={previewAsVisitor ? { filter: `blur(${BLUR_PX[blurLevel]}px)`, transform: "scale(1.08)" } : undefined}
                      />
                    ) : (
                      <img decoding="async"
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        style={previewAsVisitor ? { filter: `blur(${BLUR_PX[blurLevel]}px)`, transform: "scale(1.08)" } : undefined}
                      />
                    )}
                    {previewAsVisitor && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Lock className="h-5 w-5 text-amber-300" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={section.accept}
                multiple={section.multiple}
                onChange={handleFilesPicked}
                className="hidden"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="w-full">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {files.length > 0 ? "Trocar seleção" : "Substituir mídia publicada"}
              </Button>
              {files.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nova seleção pronta para substituir a mídia atual ao salvar.
                </p>
              )}
            </div>

            {section.isVideo && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverPicked} className="hidden" />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Capa do vídeo</p>
                    <p className="text-[11px] text-muted-foreground">Envie outra thumb, capture um frame ou remova a capa atual.</p>
                  </div>
                  {coverPreview ? (
                    <img loading="lazy" decoding="async" src={coverPreview} alt="Capa" className="h-14 w-14 shrink-0 rounded-md border border-border object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => coverInputRef.current?.click()}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Enviar capa
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleCaptureFrame} disabled={!canCaptureFrame}>
                    <ImageIcon className="mr-1.5 h-3.5 w-3.5" /> Capturar frame
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={handleRemoveCover}>
                    Remover capa
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-paid-title">Título</Label>
              <Input id="edit-paid-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} maxLength={80} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-paid-description">Descrição</Label>
                <span className="text-[10px] text-muted-foreground">{description.length}/250</span>
              </div>
              <Textarea
                id="edit-paid-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 250))}
                rows={3}
                maxLength={250}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-paid-price">Valor avulso (R$)</Label>
              <Input
                id="edit-paid-price"
                type="number"
                min="1"
                max="500"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Preço bruto</span><span>R$ {split.p.toFixed(2).replace(".", ",")}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Imposto (6%)</span><span className="text-destructive">- R$ {split.tax.toFixed(2).replace(".", ",")}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Plataforma (20%)</span><span className="text-destructive">- R$ {split.platform.toFixed(2).replace(".", ",")}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Afiliado (5%)</span><span className="text-destructive">- R$ {split.affiliate.toFixed(2).replace(".", ",")}</span></div>
                <div className="my-1 border-t border-border/60" />
                <div className="flex items-center justify-between"><span className="font-semibold text-emerald-500">Você recebe ({split.pct}%)</span><span className="font-bold text-emerald-500">R$ {split.creator.toFixed(2).replace(".", ",")}</span></div>
              </div>
            </div>

            <div className="space-y-2.5 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Intensidade do blur</p>
                <p className="text-[11px] text-muted-foreground">Ajusta exatamente como o conteúdo bloqueado aparece para quem ainda não comprou.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["light", "medium", "strong"] as BlurLevel[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBlurLevel(value)}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                      blurLevel === value
                        ? "border-amber-400 bg-amber-500/10 text-amber-300"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-amber-400/40"
                    )}
                  >
                    {value === "light" && "Leve"}
                    {value === "medium" && "Médio"}
                    {value === "strong" && "Forte"}
                  </button>
                ))}
              </div>
              <Badge variant="secondary" className="w-fit">
                Preview atual: {blurLevel === "light" ? "leve" : blurLevel === "medium" ? "médio" : "forte"}
              </Badge>
            </div>

            {submitting && (
              <div className="space-y-1">
                <Progress value={progress} />
                <p className="text-center text-xs text-muted-foreground">{progressMsg}</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 border-t border-border/60 px-5 py-3 sm:flex-row">
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={submitting} className="flex-1 sm:flex-initial">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={submitting} className="flex-1 bg-amber-500 font-semibold text-black hover:bg-amber-600 sm:flex-initial">
            {submitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Salvando...</> : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}