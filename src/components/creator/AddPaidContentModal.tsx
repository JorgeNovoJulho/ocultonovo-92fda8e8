import { useState, useRef, useMemo } from "react";
import { useCreatorBlurPreferenceStore } from "@/store/useCreatorBlurPreferenceStore";
import { buildShareUrl } from "@/lib/appConfig";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Film,
  Video,
  Image as ImageIcon,
  Images,
  Package,
  Upload,
  ArrowLeft,
  Loader2,
  Lock,
  Copy,
  Share2,
  CheckCircle2,
  Droplets,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseExternal";
import { getCanonicalAuthorIds } from "@/lib/postAuthorResolver";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { smartImageUpload, smartVideoUpload, validateVideoDuration } from "@/lib/smartUpload";
import { applyImageWatermark, buildWatermarkMeta } from "@/lib/watermark";
import { useQueryClient } from "@tanstack/react-query";

type SectionKey = "short_video" | "long_video" | "photo" | "photo_pack" | "video_pack";
type BlurLevel = "light" | "medium" | "strong";

interface SectionDef {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accept: string;
  multiple: boolean;
  isVideo: boolean;
  maxDuration?: number;
  hint: string;
}

const SECTIONS: SectionDef[] = [
  { key: "short_video", label: "Vídeos curtos", icon: Film, accept: "video/*", multiple: false, isVideo: true, maxDuration: 90, hint: "Vídeo único de até 1m30s" },
  { key: "long_video", label: "Vídeos longos", icon: Video, accept: "video/*", multiple: false, isVideo: true, maxDuration: 1800, hint: "Vídeo único de até 30 min" },
  { key: "photo", label: "Imagens & Fotos", icon: ImageIcon, accept: "image/*", multiple: false, isVideo: false, hint: "1 foto" },
  { key: "photo_pack", label: "Pack de imagens", icon: Images, accept: "image/*", multiple: true, isVideo: false, hint: "2 a 20 fotos" },
  { key: "video_pack", label: "Pack de vídeos curtos", icon: Package, accept: "video/*", multiple: true, isVideo: true, maxDuration: 90, hint: "2 a 10 vídeos (até 1m30s cada)" },
];

const BLUR_PX: Record<BlurLevel, number> = { light: 14, medium: 32, strong: 90 };

interface AddPaidContentModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  channelName?: string;
  initialSectionKey?: SectionKey;
  promoMode?: boolean;
}

export default function AddPaidContentModal({ open, onOpenChange, channelName, initialSectionKey, promoMode = false }: AddPaidContentModalProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialSection = useMemo(
    () => (initialSectionKey ? SECTIONS.find((s) => s.key === initialSectionKey) || null : null),
    [initialSectionKey]
  );
  const [step, setStep] = useState<"section" | "upload" | "preview" | "share">(initialSection ? "upload" : "section");
  const [section, setSection] = useState<SectionDef | null>(initialSection);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState<File | Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [price, setPrice] = useState<string>("19.90");
  const [watermark, setWatermark] = useState(true);
  const defaultBlurPref = useCreatorBlurPreferenceStore((s) => s.defaultBlur);
  const setDefaultBlurPref = useCreatorBlurPreferenceStore((s) => s.setDefaultBlur);
  const [blurLevel, setBlurLevel] = useState<BlurLevel>(defaultBlurPref);
  const [previewAsVisitor, setPreviewAsVisitor] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoDurations, setVideoDurations] = useState<Map<string, number>>(new Map());
  const [progressMsg, setProgressMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const username = (profile as any)?.username || "criador";
  const ownerProfileId = (profile as any)?.id || user?.id || null;
  const finalChannelName = channelName || (profile as any)?.display_name || username;

  const reset = () => {
    previews.forEach((p) => URL.revokeObjectURL(p));
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setStep("section");
    setSection(null);
    setFiles([]);
    setPreviews([]);
    setTitle("");
    setDescription("");
    setCoverFile(null);
    setCoverPreview("");
    setPrice("19.90");
    setWatermark(true);
    setBlurLevel(defaultBlurPref);
    setPreviewAsVisitor(false);
    setProgress(0);
    setProgressMsg("");
    setSubmitting(false);
    setShareUrl("");
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleSelectSection = (s: SectionDef) => {
    setSection(s);
    setStep("upload");
  };

  const handleFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!section) return;
    const list = Array.from(e.target.files || []);
    if (list.length === 0) return;

    if (section.multiple && list.length < 2) {
      toast.error("Selecione pelo menos 2 arquivos para um pack");
      return;
    }
    if (section.key === "photo_pack" && list.length > 20) {
      toast.error("Máximo 20 fotos no pack");
      return;
    }
    if (section.key === "video_pack" && list.length > 10) {
      toast.error("Máximo 10 vídeos curtos no pack");
      return;
    }

    const durationsMap = new Map<string, number>();
    if (section.isVideo && section.maxDuration) {
      for (const f of list) {
        const v = await validateVideoDuration(f, section.maxDuration);
        if (!v.valid) {
          toast.error(`Vídeo "${f.name}" excede ${section.maxDuration}s (${v.duration.toFixed(1)}s)`);
          return;
        }
        durationsMap.set(`${f.name}-${f.size}`, Math.round(v.duration));
      }
    }
    setVideoDurations(durationsMap);

    previews.forEach((p) => URL.revokeObjectURL(p));
    setFiles(list);
    setPreviews(list.map((f) => URL.createObjectURL(f)));
  };

  const handleCoverPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Capa deve ser uma imagem");
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const handleCaptureFrame = async () => {
    const v = videoPreviewRef.current;
    if (!v || !v.videoWidth) {
      toast.error("Aguarde o vídeo carregar e pause no frame desejado");
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao capturar"))), "image/jpeg", 0.85)
      );
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      setCoverFile(blob);
      setCoverPreview(URL.createObjectURL(blob));
      toast.success("Frame capturado como capa");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao capturar frame");
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || !section || files.length === 0 || !ownerProfileId) return;

    const priceNum = parseFloat(price.replace(",", "."));
    if (!Number.isFinite(priceNum) || priceNum < 1 || priceNum > 500) {
      toast.error("Valor avulso deve estar entre R$ 1,00 e R$ 500,00");
      return;
    }

    setSubmitting(true);
    setProgress(0);
    setProgressMsg("Preparando...");

    try {
      const uploadedUrls: string[] = [];
      const wmMeta = watermark
        ? buildWatermarkMeta({ channelName: finalChannelName, username })
        : null;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const baseMsg = `Arquivo ${i + 1}/${files.length}`;
        setProgressMsg(`${baseMsg}: enviando...`);

        let toUpload: File | Blob = f;
        if (watermark && !section.isVideo) {
          setProgressMsg(`${baseMsg}: aplicando marca d'água...`);
          toUpload = await applyImageWatermark(f, {
            channelName: finalChannelName,
            username,
          });
        }

        const result = section.isVideo
          ? await smartVideoUpload(f, user.id, "vip-paid", "post-media", (p) => {
              const fileBase = (i / files.length) * 100;
              const filePart = (p.percent / files.length);
              setProgress(Math.round(fileBase + filePart));
              setProgressMsg(`${baseMsg}: ${p.message}`);
            })
          : await smartImageUpload(toUpload, user.id, "vip-paid", "post-media", (p) => {
              const fileBase = (i / files.length) * 100;
              const filePart = (p.percent / files.length);
              setProgress(Math.round(fileBase + filePart));
              setProgressMsg(`${baseMsg}: ${p.message}`);
            });

        uploadedUrls.push(result.publicUrl);
      }

      // Upload da capa (se enviada/capturada)
      let coverUrl: string | null = null;
      if (coverFile) {
        setProgressMsg("Enviando capa...");
        const coverResult = await smartImageUpload(coverFile, user.id, "vip-cover", "post-media", () => {});
        coverUrl = coverResult.publicUrl;
      }

      setProgress(100);
      setProgressMsg("Salvando publicação...");

      const mediaType = section.isVideo ? "video" : "image";
      const isPack = section.multiple;
      const slug = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

      const desc = description.trim().slice(0, 250);

      const maxDuration = section.isVideo
        ? files.reduce((acc, f) => Math.max(acc, videoDurations.get(`${f.name}-${f.size}`) || 0), 0)
        : 0;

      const { authorProfileId, creatorId } = await getCanonicalAuthorIds(user.id);
      const insertPayload: any = {
        author_id: authorProfileId,
        creator_id: creatorId,
        content_text: title || null,
        description: desc || null,
        media_url: uploadedUrls[0],
        media_urls: isPack ? uploadedUrls : null,
        thumbnail_url: coverUrl,
        media_type: mediaType,
        privacy_level: "vip",
        is_locked: !promoMode || priceNum > 0,
        is_paid: !promoMode || priceNum > 0,
        paid_price: promoMode && priceNum === 0 ? 0 : priceNum,
        section_type: promoMode ? "promo" : section.key,
        watermark_meta: wmMeta,
        share_slug: slug,
        preview_blur: blurLevel,
        ...(promoMode ? { is_promo: true, promo_price: priceNum } : {}),
        ...(section.isVideo && maxDuration > 0
          ? { video_duration_seconds: maxDuration }
          : {}),
      };

      const { data: inserted, error } = await (supabase as any)
        .from("posts")
        .insert(insertPayload)
        .select("id, share_slug")
        .single();

      if (error) throw error;

      const url = buildShareUrl(`/c/${inserted.share_slug || inserted.id}`);
      setShareUrl(url);
      setStep("share");

      queryClient.invalidateQueries({ queryKey: ["creator-media"] });
      queryClient.invalidateQueries({ queryKey: ["creator-channel"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["posts-infinite"] });
      queryClient.refetchQueries({ queryKey: ["posts-infinite"], type: "active" });
      toast.success("Conteúdo publicado no canal!");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao publicar conteúdo");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Conteúdo exclusivo OCULTO", text: title || "Confere esse conteúdo", url: shareUrl });
      } catch {}
    } else {
      handleCopy();
    }
  };

  // Split: 6% imposto -> 20% plataforma -> 5% afiliado (sobre líquido) -> criador fica com ~75.2% bruto
  const split = useMemo(() => {
    const p = parseFloat(price.replace(",", ".")) || 0;
    const tax = +(p * 0.06).toFixed(2);
    const afterTax = p - tax;
    const platform = +(afterTax * 0.20).toFixed(2);
    const affiliate = +(afterTax * 0.05).toFixed(2);
    const creator = +(p - tax - platform - affiliate).toFixed(2);
    const pct = p > 0 ? ((creator / p) * 100).toFixed(1) : "0";
    return { p, tax, platform, affiliate, creator, pct };
  }, [price]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "p-0 gap-0 border-border bg-background",
          // Mobile: fullscreen sheet. Desktop: dialog centered
          "w-screen h-[100dvh] max-w-none rounded-none sm:w-full sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-lg",
          "flex flex-col overflow-hidden"
        )}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lock className="h-5 w-5 text-[hsl(45,93%,47%)]" />
            {step === "section" && "Adicionar Conteúdo"}
            {step === "upload" && section?.label}
            {step === "preview" && "Confirmar publicação"}
            {step === "share" && "Pronto! Compartilhe"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === "section" && "Escolha a seção do canal pago"}
            {step === "upload" && (section?.hint || "Selecione o conteúdo")}
            {step === "preview" && "Veja como sua landing de compartilhamento ficará"}
            {step === "share" && "Use o link abaixo para divulgar"}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body — barra de scroll oculta */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {step === "section" && (
            <div className="grid grid-cols-2 gap-3">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    onClick={() => handleSelectSection(s)}
                    className="flex flex-col items-start gap-2 rounded-xl border border-border bg-muted/40 p-4 text-left hover:border-[hsl(45,93%,47%)]/60 hover:bg-[hsl(45,93%,47%)]/5 transition-colors"
                  >
                    <Icon className="h-6 w-6 text-[hsl(45,93%,47%)]" />
                    <div>
                      <p className="font-semibold text-sm">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step === "upload" && section && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept={section.accept}
                multiple={section.multiple}
                onChange={handleFilesPicked}
                className="hidden"
              />

              {previews.length === 0 ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-2 hover:border-[hsl(45,93%,47%)]/60 transition-colors"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Selecionar da galeria</p>
                  <p className="text-xs text-muted-foreground">{section.hint}</p>
                </button>
              ) : (
                <>
                  {/* Preview com toggle "ver como visitante" */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Pré-visualização</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewAsVisitor((v) => !v)}
                        className="h-7 text-[11px] gap-1"
                      >
                        {previewAsVisitor ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        {previewAsVisitor ? "Ver como criador" : "Testar como visitante"}
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {previews.map((p, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border">
                          {section.isVideo ? (
                            <video preload="none"
                              ref={i === 0 ? videoPreviewRef : undefined}
                              src={p}
                              className="w-full h-full object-cover"
                              muted
                              controls={i === 0 && !previewAsVisitor}
                              playsInline
                              crossOrigin="anonymous"
                              style={previewAsVisitor ? { filter: `blur(${BLUR_PX[blurLevel]}px)`, transform: "scale(1.1)" } : undefined}
                            />
                          ) : (
                            <img loading="lazy" decoding="async"
                              src={p}
                              alt=""
                              className="w-full h-full object-cover"
                              style={previewAsVisitor ? { filter: `blur(${BLUR_PX[blurLevel]}px)`, transform: "scale(1.1)" } : undefined}
                            />
                          )}
                          {previewAsVisitor && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Lock className="h-5 w-5 text-[hsl(45,93%,55%)]" />
                            </div>
                          )}
                          <Badge className="absolute top-1 right-1 bg-[hsl(45,93%,47%)]/90 text-[hsl(45,93%,10%)] text-[10px] px-1.5">
                            <Lock className="h-2.5 w-2.5" />
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="w-full">
                    Trocar arquivos
                  </Button>

                  {/* Capa do vídeo (apenas para seções de vídeo) */}
                  {section.isVideo && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleCoverPicked}
                        className="hidden"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Capa do vídeo</p>
                          <p className="text-[11px] text-muted-foreground">
                            Envie uma thumb ou capture um frame do vídeo (pause no momento desejado).
                          </p>
                        </div>
                        {coverPreview && (
                          <img loading="lazy" decoding="async" src={coverPreview} alt="capa" className="h-14 w-14 object-cover rounded-md border border-border shrink-0" />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => coverInputRef.current?.click()}>
                          <Upload className="h-3.5 w-3.5 mr-1.5" /> Enviar capa
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={handleCaptureFrame}>
                          <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Capturar frame
                        </Button>
                      </div>
                      {coverFile && (
                        <Button
                          type="button" variant="ghost" size="sm"
                          onClick={() => { if (coverPreview) URL.revokeObjectURL(coverPreview); setCoverFile(null); setCoverPreview(""); }}
                          className="w-full h-7 text-[11px] text-muted-foreground"
                        >
                          Remover capa
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="paid-title">Título (opcional)</Label>
                <Input
                  id="paid-title"
                  placeholder="Ex.: Aquela mamada dupla..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                  maxLength={80}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="paid-desc">Descrição (até 250 caracteres)</Label>
                  <span className="text-[10px] text-muted-foreground">{description.length}/250</span>
                </div>
                <Textarea
                  id="paid-desc"
                  placeholder="Conte o que rola nesse conteúdo, dê contexto e desperte curiosidade..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 250))}
                  maxLength={250}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paid-price">Valor avulso (R$)</Label>
                <Input
                  id="paid-price"
                  type="number"
                  step="0.01"
                  min="1"
                  max="500"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />

                {/* Split detalhado */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Preço bruto</span>
                    <span className="font-medium">R$ {split.p.toFixed(2).replace(".", ",")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Imposto (6%)</span>
                    <span className="text-destructive">- R$ {split.tax.toFixed(2).replace(".", ",")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Plataforma OCULTO (20%)</span>
                    <span className="text-destructive">- R$ {split.platform.toFixed(2).replace(".", ",")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Afiliado/Madrinha (5% se houver)</span>
                    <span className="text-destructive">- R$ {split.affiliate.toFixed(2).replace(".", ",")}</span>
                  </div>
                  <div className="border-t border-border/60 my-1" />
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-500 font-semibold">Você recebe ({split.pct}%)</span>
                    <span className="text-emerald-500 font-bold text-sm">R$ {split.creator.toFixed(2).replace(".", ",")}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Se não houver afiliado vinculado à venda, a parte de afiliado fica com você.
                  </p>
                </div>
              </div>

              {/* Blur selector — para criador o conteúdo aparece sempre nítido; visitantes veem o blur escolhido até comprarem */}
              <div className="rounded-lg border border-border p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Intensidade do blur</p>
                    <p className="text-[11px] text-muted-foreground">Quanto borrado o conteúdo aparece para quem ainda não comprou.</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["light", "medium", "strong"] as BlurLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => { setBlurLevel(lvl); setDefaultBlurPref(lvl); }}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                        blurLevel === lvl
                          ? "border-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,55%)]"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-[hsl(45,93%,47%)]/40"
                      )}
                    >
                      {lvl === "light" && "Leve"}
                      {lvl === "medium" && "Médio"}
                      {lvl === "strong" && "Forte"}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Use o botão <strong>Testar como visitante</strong> acima da pré-visualização para ver como o conteúdo aparecerá.
                </p>
              </div>

              {!section.isVideo && (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                    <div>
                      <p className="text-sm font-medium">Marca d'água</p>
                      <p className="text-[11px] text-muted-foreground">Canal · @{username} · OCULTO · data</p>
                    </div>
                  </div>
                  <Switch checked={watermark} onCheckedChange={setWatermark} />
                </div>
              )}

              {submitting && (
                <div className="space-y-1">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground text-center">{progressMsg}</p>
                </div>
              )}
            </div>
          )}


          {step === "preview" && section && previews.length > 0 && (
            <div className="space-y-4">
              <p className="text-[11px] text-muted-foreground text-center">
                Esta é a prévia da landing pública que será gerada. Visitantes verão o conteúdo
                desfocado com a intensidade <strong>{blurLevel === "light" ? "leve" : blurLevel === "medium" ? "média" : "forte"}</strong> até comprarem.
              </p>

              <div className="mx-auto max-w-xs rounded-xl border border-[hsl(45,93%,47%)]/30 overflow-hidden bg-card shadow-lg">
                <div className="relative aspect-[4/5] bg-muted">
                  {section.isVideo ? (
                    <video preload="none"
                      src={previews[0]}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ filter: `blur(${BLUR_PX[blurLevel]}px)`, transform: "scale(1.1)" }}
                    />
                  ) : (
                    <img loading="lazy" decoding="async"
                      src={previews[0]}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{ filter: `blur(${BLUR_PX[blurLevel]}px)`, transform: "scale(1.1)" }}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="rounded-full bg-[hsl(45,93%,47%)]/90 p-3">
                      <Lock className="h-6 w-6 text-[hsl(45,93%,10%)]" />
                    </div>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[hsl(45,93%,47%)] text-xs font-semibold">
                    <Lock className="h-3 w-3" /> {finalChannelName}
                  </div>
                  {title && <p className="text-sm font-semibold leading-snug line-clamp-2">{title}</p>}
                  <div className="rounded border border-[hsl(45,93%,47%)]/30 bg-[hsl(45,93%,47%)]/5 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Acesso individual</p>
                    <p className="text-lg font-bold text-[hsl(45,93%,47%)]">
                      R$ {(parseFloat(price.replace(",", ".")) || 0).toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                  <div className="w-full rounded bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] text-xs font-semibold py-1.5 text-center">
                    Acessar conteúdo
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Seção</span><span>{section.label}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Arquivos</span><span>{files.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Preço</span><span>R$ {(parseFloat(price.replace(",", ".")) || 0).toFixed(2).replace(".", ",")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Você recebe</span><span className="text-emerald-500 font-semibold">R$ {split.creator.toFixed(2).replace(".", ",")}</span></div>
              </div>

              {submitting && (
                <div className="space-y-1">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground text-center">{progressMsg}</p>
                </div>
              )}
            </div>
          )}

          {step === "share" && (
            <div className="space-y-4 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <p className="text-sm">
                Seu conteúdo foi publicado e está disponível no seu canal.
                Compartilhe o link abaixo para atrair novos compradores — quem
                não tiver conta poderá criar uma direto na landing.
              </p>
              <div className="rounded-lg border border-border bg-muted/40 p-3 break-all text-xs">
                {shareUrl}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="flex-1" onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-1.5" /> Copiar link
                </Button>
                <Button className="flex-1 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)]" onClick={handleNativeShare}>
                  <Share2 className="h-4 w-4 mr-1.5" /> Compartilhar
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border/60 gap-2 flex-row sm:flex-row">
          {step === "upload" && (
            <>
              <Button variant="ghost" onClick={() => { reset(); setStep("section"); }} disabled={submitting} className="flex-1 sm:flex-initial">
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button
                onClick={() => setStep("preview")}
                disabled={files.length === 0}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold"
              >
                <Eye className="h-4 w-4 mr-1.5" /> Pré-visualizar landing
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={submitting} className="flex-1 sm:flex-initial">
                <ArrowLeft className="h-4 w-4 mr-1" /> Editar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || files.length === 0}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold"
              >
                {submitting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Publicando...</> : <><Share2 className="h-4 w-4 mr-1.5" /> Publicar e gerar link</>}
              </Button>
            </>
          )}
          {step === "share" && (
            <Button onClick={() => handleClose(false)} className="w-full">Fechar</Button>
          )}
          {step === "section" && (
            <Button variant="ghost" onClick={() => handleClose(false)} className="w-full">Cancelar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
