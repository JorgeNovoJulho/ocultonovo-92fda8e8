import { useState, useEffect, useRef, useCallback, lazy, Suspense, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Crown, Image as ImageIcon, Film, Sparkles, ExternalLink, Info, Plus, FileImage,
  Upload, Loader2, Check, X, Pencil, HelpCircle, Play, AlertCircle, CheckCircle2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

type UploadStatus =
  | { phase: "idle" }
  | { phase: "uploading"; percent: number; message: string }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string };

const IDLE: UploadStatus = { phase: "idle" };

function StatusFeedback({ status }: { status: UploadStatus }) {
  if (status.phase === "idle") return null;
  if (status.phase === "uploading") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span className="truncate">{status.message} {status.percent > 0 ? `· ${status.percent}%` : ""}</span>
        </div>
        <Progress value={status.percent || 5} className="h-1" />
      </div>
    );
  }
  if (status.phase === "success") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{status.message}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-destructive">
      <AlertCircle className="h-3 w-3 shrink-0" />
      <span className="truncate">{status.message}</span>
    </div>
  );
}
import { toast } from "sonner";
import { smartImageUpload, smartVideoUpload, validateVideoDuration } from "@/lib/smartUpload";
import { cn } from "@/lib/utils";
import { fetchCreatorPlans, getAnnualDiscountPercent } from "@/lib/creatorPlanPersistence";

const VIPPricingConfigModal = lazy(() =>
  import("@/components/creator/VIPPricingConfigModal").then((m) => ({ default: m.VIPPricingConfigModal })),
);

const VitrinePlansModal = lazy(() =>
  import("@/components/VitrinePlansModal").then((m) => ({ default: m.VitrinePlansModal })),
);

interface PlanRow {
  id: string;
  title: string | null;
  bio: string | null;
  banner_url: string | null;
  monthly_price: number;
  annual_price: number | null;
  intro_kind: "video" | "image" | "gif" | null;
  intro_url: string | null;
  intro_poster: string | null;
  intro_duration_seconds: number | null;
}

const TRAILER_MAX_SECONDS = 90;
const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

// Tip helper — explica cada item para o criador
function Tip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export default function VipProfileManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "planos";
  const initialPlan = searchParams.get("plan");
  const autoOpen = searchParams.has("tab") || searchParams.has("plan");
  const [openConfig, setOpenConfig] = useState(autoOpen);

  // Inline edit state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [bannerStatus, setBannerStatus] = useState<UploadStatus>(IDLE);
  const [coverStatus, setCoverStatus] = useState<UploadStatus>(IDLE);
  const [trailerStatus, setTrailerStatus] = useState<UploadStatus>(IDLE);
  const uploadingBanner = bannerStatus.phase === "uploading";
  const uploadingCover = coverStatus.phase === "uploading";
  const uploadingTrailer = trailerStatus.phase === "uploading";
  const [showTrailerPreview, setShowTrailerPreview] = useState(false);
  const [showVitrineModal, setShowVitrineModal] = useState(false);

  const bannerFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const trailerFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoOpen) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      next.delete("plan");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["my-vip-plan", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id,username")
        .eq("user_id", user!.id)
        .single();
      if (!prof?.id) return null;
      const plans = await fetchCreatorPlans(prof.id);
      const firstPlan = (plans[0] as PlanRow | undefined) ?? null;
      return { profile: prof, plan: firstPlan };
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const plan = data?.plan;
  const profileId = data?.profile?.id;
  const hasIntro = !!(plan?.intro_url && plan?.intro_kind);
  const annualDiscount = useMemo(
    () => getAnnualDiscountPercent(plan?.monthly_price, plan?.annual_price),
    [plan?.monthly_price, plan?.annual_price],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-vip-plan", user?.id] });
    await queryClient.invalidateQueries({ queryKey: ["vitrine-plans"] });
    await queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
    await queryClient.invalidateQueries({ queryKey: ["creator-plans"] });
  }, [queryClient, user?.id]);

  // Atualiza diretamente uma coluna do plano único (canal). Cria silenciosamente se faltar.
  const patchPlan = useCallback(
    async (patch: Record<string, any>) => {
      if (!profileId) {
        toast.error("Carregando seu perfil... tente novamente em instantes.");
        throw new Error("no profile");
      }
      if (!plan?.id) {
        toast.error("Crie um plano primeiro para configurar o canal.", {
          description: "Toque em 'Configurar canal VIP' para criar o primeiro plano.",
        });
        throw new Error("no plan");
      }
      const { error } = await (supabase as any)
        .from("subscription_plans")
        .update(patch)
        .eq("id", plan.id);
      if (error) throw error;
      await refresh();
    },
    [plan?.id, profileId, refresh],
  );

  // Title save
  const startEditTitle = () => {
    setTitleDraft(plan?.title || "");
    setEditingTitle(true);
  };
  const cancelEditTitle = () => {
    setEditingTitle(false);
    setTitleDraft("");
  };
  const saveTitle = async () => {
    const t = titleDraft.trim();
    if (t.length < 3) {
      toast.error("Nome muito curto", { description: "Use ao menos 3 caracteres." });
      return;
    }
    setSavingTitle(true);
    try {
      await patchPlan({ title: t });
      toast.success("Nome do canal atualizado");
      setEditingTitle(false);
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e?.message });
    } finally {
      setSavingTitle(false);
    }
  };

  // Banner upload
  const onBannerFiles = async (files: FileList | null) => {
    if (!files?.[0] || !user?.id) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      const msg = "Formato inválido. Envie JPG, PNG, GIF ou WebP.";
      setBannerStatus({ phase: "error", message: msg });
      toast.error(msg);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      const msg = `Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máx. 8MB.`;
      setBannerStatus({ phase: "error", message: msg });
      toast.error(msg);
      return;
    }
    setBannerStatus({ phase: "uploading", percent: 0, message: "Enviando banner…" });
    try {
      const r = await smartImageUpload(file, user.id, "vip-banner", "plan-media", (p) => {
        setBannerStatus({ phase: "uploading", percent: p.percent || 0, message: p.message || "Enviando banner…" });
      });
      await patchPlan({ banner_url: r.publicUrl });
      setBannerStatus({ phase: "success", message: "Banner atualizado!" });
      toast.success("Banner do canal atualizado!");
      setTimeout(() => setBannerStatus(IDLE), 3500);
    } catch (e: any) {
      const msg = e?.message || "Falha no upload do banner.";
      setBannerStatus({ phase: "error", message: msg });
      toast.error("Falha no upload do banner", { description: msg });
    } finally {
      if (bannerFileRef.current) bannerFileRef.current.value = "";
    }
  };

  // Capa upload
  const onCoverFiles = async (files: FileList | null) => {
    if (!files?.[0] || !user?.id) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      const msg = "Envie uma imagem ou GIF.";
      setCoverStatus({ phase: "error", message: msg });
      toast.error(msg);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const msg = `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máx. 10MB.`;
      setCoverStatus({ phase: "error", message: msg });
      toast.error(msg);
      return;
    }
    setCoverStatus({ phase: "uploading", percent: 0, message: "Enviando capa…" });
    try {
      const r = await smartImageUpload(file, user.id, "vip-cover", "plan-media", (p) => {
        setCoverStatus({ phase: "uploading", percent: p.percent || 0, message: p.message || "Enviando capa…" });
      });
      await patchPlan({ banner_url: r.publicUrl });
      setCoverStatus({ phase: "success", message: "Capa atualizada!" });
      toast.success("Capa atualizada!");
      setTimeout(() => setCoverStatus(IDLE), 3500);
    } catch (e: any) {
      const msg = e?.message || "Falha no upload da capa.";
      setCoverStatus({ phase: "error", message: msg });
      toast.error("Falha no upload da capa", { description: msg });
    } finally {
      if (coverFileRef.current) coverFileRef.current.value = "";
    }
  };

  // Trailer upload (video ≤ 90s)
  const onTrailerFiles = async (files: FileList | null) => {
    if (!files?.[0] || !user?.id) return;
    const file = files[0];
    if (!file.type.startsWith("video/")) {
      const msg = "Envie um vídeo (MP4, MOV ou WebM).";
      setTrailerStatus({ phase: "error", message: msg });
      toast.error(msg);
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      const msg = `Vídeo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máx. 80MB.`;
      setTrailerStatus({ phase: "error", message: msg });
      toast.error(msg);
      return;
    }

    setTrailerStatus({ phase: "uploading", percent: 0, message: "Validando duração…" });
    try {
      const v = await validateVideoDuration(file, TRAILER_MAX_SECONDS);
      if (!v.valid) {
        const msg = `Trailer muito longo (${Math.round(v.duration)}s). Máx. ${TRAILER_MAX_SECONDS}s (1m30s).`;
        setTrailerStatus({ phase: "error", message: msg });
        toast.error("Trailer muito longo", { description: msg });
        return;
      }
      setTrailerStatus({ phase: "uploading", percent: 0, message: "Enviando trailer…" });
      const r = await smartVideoUpload(file, user.id, "vip-trailer", "plan-media", (p) => {
        setTrailerStatus({ phase: "uploading", percent: p.percent || 0, message: p.message || "Enviando trailer…" });
      });
      await patchPlan({
        intro_kind: "video",
        intro_url: r.publicUrl,
        intro_duration_seconds: Math.round(v.duration),
      });
      setTrailerStatus({ phase: "success", message: `Trailer enviado (${Math.round(v.duration)}s)` });
      toast.success("Trailer atualizado!");
      setTimeout(() => setTrailerStatus(IDLE), 3500);
    } catch (e: any) {
      const msg = e?.message || "Falha no upload do trailer.";
      setTrailerStatus({ phase: "error", message: msg });
      toast.error("Falha no upload do trailer", { description: msg });
    } finally {
      if (trailerFileRef.current) trailerFileRef.current.value = "";
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const noPlan = !plan;

  return (
    <div className="space-y-4">
      {/* ── Guia rápido: onde fazer o quê ── */}
      <Card className="border-[hsl(45,93%,47%)]/30 bg-gradient-to-br from-[hsl(45,93%,47%)]/5 to-transparent">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-[hsl(45,93%,47%)] mt-0.5 shrink-0" />
            <div className="text-sm w-full">
              <p className="font-semibold text-foreground mb-1">Onde criar e publicar seu conteúdo VIP?</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <Crown className="h-3.5 w-3.5 text-[hsl(45,93%,47%)] mt-0.5 shrink-0" />
                  <span><strong className="text-foreground">1. Crie seu canal pago</strong> aqui mesmo (botão <em>Configurar canal VIP</em>) — define preço mensal/anual, capa e trailer.</span>
                </li>
                <li className="flex gap-2">
                  <Plus className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <span><strong className="text-foreground">2. Publique conteúdo VIP exclusivo</strong> usando <em>Criar Post</em> (sidebar) com visibilidade <em>VIP</em>.</span>
                </li>
                <li className="flex gap-2">
                  <FileImage className="h-3.5 w-3.5 text-pink-400 mt-0.5 shrink-0" />
                  <span><strong className="text-foreground">3. Venda mídias avulsas (PPV)</strong> em <em>Criar Post → Conteúdo Pago</em>.</span>
                </li>
              </ul>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                  <Link to="/subscriptions">Gerenciar planos & preços</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                  <Link to="/dashboard?tab=monetization">Conteúdos pagos vendidos</Link>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gradient-border overflow-hidden">
        {/* Banner editável */}
        <div
          className="h-32 sm:h-40 w-full relative bg-muted"
          style={
            plan?.banner_url
              ? { backgroundImage: `url(${plan.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined
          }
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

          {/* Botão para trocar banner */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5">
            <Tip text="Banner do canal: imagem grande exibida no topo do seu canal e no card da vitrine. Recomendado 1600×600px, máx 8MB. JPG, PNG, WebP ou GIF." />
            <input
              ref={bannerFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onBannerFiles(e.target.files)}
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-[11px] gap-1 bg-background/85 backdrop-blur-sm"
              onClick={() => bannerFileRef.current?.click()}
              disabled={uploadingBanner || noPlan}
            >
              {uploadingBanner ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {plan?.banner_url ? "Trocar banner" : "Adicionar banner"}
            </Button>
          </div>

          <div className="absolute bottom-3 left-4 right-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Badge className="bg-[hsl(45,93%,47%)] text-[hsl(45,93%,10%)]">
                <Crown className="h-3 w-3 mr-1" /> Perfil VIP
              </Badge>

              {/* Nome editável */}
              {!editingTitle ? (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                    {plan?.title || "Configure seu canal VIP"}
                  </h3>
                  {!noPlan && (
                    <button
                      type="button"
                      onClick={startEditTitle}
                      className="shrink-0 p-1 rounded-md hover:bg-background/40 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Editar nome do canal"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <Tip text="Nome público do seu canal VIP. Aparece no topo, na vitrine e no checkout. Use algo curto e marcante (3 a 60 caracteres)." />
                </div>
              ) : (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    maxLength={60}
                    autoFocus
                    placeholder="Nome do canal"
                    className="h-8 text-sm w-full sm:w-64 bg-background/90"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitle();
                      if (e.key === "Escape") cancelEditTitle();
                    }}
                  />
                  <Button size="sm" className="h-8 px-2" onClick={saveTitle} disabled={savingTitle}>
                    {savingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2" onClick={cancelEditTitle} disabled={savingTitle}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => setShowVitrineModal(true)}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver vitrine
            </Button>
          </div>
        </div>

        <CardContent className="pt-4 space-y-4">
          {bannerStatus.phase !== "idle" && (
            <div className="rounded-md border border-border/50 bg-muted/20 p-2">
              <StatusFeedback status={bannerStatus} />
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {plan?.bio || "Adicione descrição premium, capa e trailer para destacar seu canal."}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Mini label="Mensal" value={plan ? fmt(plan.monthly_price) : "—"} />
            <Mini
              label="Anual"
              value={plan?.annual_price ? fmt(plan.annual_price) : "—"}
              meta={annualDiscount > 0 ? `${annualDiscount}% OFF` : undefined}
            />

            {/* Capa card — upload inline */}
            <div className="rounded-lg bg-muted/20 border border-border/40 p-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
                Capa
                <Tip text="Imagem ou GIF que aparece como capa do seu canal no card da vitrine. Recomendado 1200×800px. JPG, PNG, WebP ou GIF (máx 10MB)." />
              </div>
              <p className={cn("text-sm font-semibold", plan?.banner_url && "text-emerald-500")}>
                {plan?.banner_url ? "OK" : "Sem capa"}
              </p>
              <input
                ref={coverFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onCoverFiles(e.target.files)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-[11px] gap-1"
                onClick={() => coverFileRef.current?.click()}
                disabled={uploadingCover || noPlan}
              >
                {uploadingCover ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                {plan?.banner_url ? "Trocar" : "Enviar"}
              </Button>
              <StatusFeedback status={coverStatus} />
            </div>

            {/* Trailer card — upload inline (≤90s) */}
            <div className="rounded-lg bg-muted/20 border border-border/40 p-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Film className="h-3 w-3" />
                Trailer
                <Tip text="Vídeo curto (até 1m30s) que assinantes em potencial podem assistir antes de assinar. MP4, MOV ou WebM. Máx 80MB." />
              </div>
              <p className={cn("text-sm font-semibold truncate", hasIntro && "text-emerald-500")}>
                {hasIntro
                  ? `${plan!.intro_kind!.toUpperCase()}${plan!.intro_duration_seconds ? ` · ${plan!.intro_duration_seconds}s` : ""}`
                  : "Sem trailer"}
              </p>
              <input
                ref={trailerFileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => onTrailerFiles(e.target.files)}
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-[11px] gap-1 min-w-0"
                  onClick={() => trailerFileRef.current?.click()}
                  disabled={uploadingTrailer || noPlan}
                >
                  {uploadingTrailer ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> : <Upload className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{hasIntro ? "Trocar" : "Enviar"}</span>
                </Button>
                {hasIntro && plan!.intro_kind === "video" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => setShowTrailerPreview((v) => !v)}
                    aria-label="Pré-visualizar trailer"
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <StatusFeedback status={trailerStatus} />
            </div>
          </div>

          {/* Preview do trailer (sob demanda — performance em devices fracos) */}
          {hasIntro && showTrailerPreview && (
            <div className="rounded-lg border border-border/60 overflow-hidden bg-muted/20">
              {plan!.intro_kind === "video" ? (
                <video
                  src={plan!.intro_url!}
                  poster={plan!.intro_poster || undefined}
                  className="w-full max-h-56 object-contain bg-black"
                  controls
                  preload="metadata"
                  playsInline
                />
              ) : (
                <img
                  src={plan!.intro_url!}
                  alt="Trailer"
                  loading="lazy"
                  className="w-full max-h-56 object-contain bg-black"
                />
              )}
            </div>
          )}

          {noPlan && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
              Você ainda não tem nenhum plano criado. Toque em <strong>Configurar canal VIP</strong> abaixo
              para criar seu primeiro plano — depois você poderá personalizar banner, capa e trailer aqui.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setOpenConfig(true)}
              className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {plan ? "Editar canal VIP" : "Configurar canal VIP"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard?tab=monetization">Conteúdos pagos</Link>
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Trailer aceita vídeo até 1m30s (90s) OU imagem/GIF como capa. Validação backend protege o limite.
          </p>
        </CardContent>
      </Card>

      {openConfig && (
        <Suspense fallback={null}>
          <VIPPricingConfigModal
            open={openConfig}
            onOpenChange={(v) => {
              setOpenConfig(v);
              if (!v) refresh();
            }}
            initialTab={initialTab}
            editPlanId={initialPlan}
          />
        </Suspense>
      )}

      {showVitrineModal && (
        <Suspense fallback={null}>
          <VitrinePlansModal open={showVitrineModal} onOpenChange={setShowVitrineModal} />
        </Suspense>
      )}
    </div>
  );
}

function Mini({ label, value, meta, ok, icon: Icon }: { label: string; value: string; meta?: string; ok?: boolean; icon?: any }) {
  return (
    <div className="rounded-lg bg-muted/20 border border-border/40 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <p className={`text-sm font-semibold ${ok ? "text-emerald-500" : ""}`}>{value}</p>
        {meta && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-green-500/40 text-green-500 bg-green-500/10">
            {meta}
          </Badge>
        )}
      </div>
    </div>
  );
}
