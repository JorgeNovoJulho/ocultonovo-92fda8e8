/**
 * AdCreatorModal — Wizard profissional de criação de anúncios.
 *
 * 6 steps responsivos, mobile-first, scroll interno invisível, validação por
 * step com zod, rascunho automático em localStorage, preview multi-device.
 *
 * Contrato de salvamento: 100% compatível com `useCreateAd` / `useUpdateAd`
 * existentes — todos os campos novos (targeting/schedule/template_*) são
 * opcionais no banco (ver supabase/external_sql/2026_05_30_ads_creator_pro.sql).
 */
import { useEffect, useMemo, useRef, useState, useCallback, lazy, Suspense } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sparkles,
  Type,
  ImageIcon,
  Users,
  CalendarClock,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
  Save,
  Send,
  FileText,
  CheckCircle2,
  Trash2,
  Plus,
  AlertCircle,
  Wand2,
  ScanSearch,
  Undo2,
  Redo2,
  Library,
  Download,
  Loader2,
  Maximize2,
  Move,
  Crop,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComp } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCreateAd, useUpdateAd, type AdCampaign } from "@/hooks/useAdCampaigns";
import { useAdTemplates, AD_TEMPLATE_CATEGORIES, type AdTemplate } from "@/hooks/useAdTemplates";
import { BUILTIN_AD_TEMPLATES } from "./adTemplatesLibrary";
import { AdTemplateRenderer } from "./AdTemplateRenderer";
import { useAdAi } from "@/hooks/useAdAi";
import { useAdHistory } from "@/hooks/useAdHistory";
import { StockImageLibrary } from "./StockImageLibrary";
import { AdErrorAlert } from "./AdErrorAlert";
import { AdExportPreviewModal } from "./AdExportPreviewModal";
import { AdFullscreenPreview } from "./AdFullscreenPreview";
import { AdImageCropper } from "./AdImageCropper";
import { AdCanvasEditor } from "./editor/AdCanvasEditor";
import type { AdDoc, TextLayer, ImageLayer } from "./editor/layerTypes";
import { setOverride, type AdOverrides, type SlotKey, type Device as SlotDevice } from "./AdEditableSurface";
import type { AdErrorAction } from "@/lib/adErrors";
import {
  contentSchema,
  mediaSchema,
  targetingSchema,
  scheduleSchema,
  defaultDraft,
  WEEKDAYS_PT,
  type AdDraftState,
} from "./adCreator.schema";

const AdLivePreview = lazy(() =>
  import("./AdLivePreview").then((m) => ({ default: m.AdLivePreview })),
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: AdCampaign | null;
}

type StepKey = "template" | "content" | "media" | "targeting" | "schedule" | "preview";

const STEPS: { key: StepKey; label: string; icon: any; short: string }[] = [
  { key: "template", label: "Template", icon: Sparkles, short: "1" },
  { key: "content", label: "Conteúdo", icon: Type, short: "2" },
  { key: "media", label: "Mídia", icon: ImageIcon, short: "3" },
  { key: "targeting", label: "Segmentação", icon: Users, short: "4" },
  { key: "schedule", label: "Agenda", icon: CalendarClock, short: "5" },
  { key: "preview", label: "Publicar", icon: Eye, short: "6" },
];

const PLACEMENT_OPTIONS: { value: AdCampaign["placement"]; label: string }[] = [
  { value: "feed", label: "Feed" },
  { value: "sidebar", label: "Sidebar" },
  { value: "banner", label: "Banner" },
  { value: "modal", label: "Modal" },
];

export function AdCreatorModal({ open, onOpenChange, editing }: Props) {
  const { user } = useAuth();
  const createAd = useCreateAd();
  const updateAd = useUpdateAd();

  const draftKey = `ad-creator-draft:${user?.id ?? "anon"}:${editing?.id ?? "new"}`;
  const history = useAdHistory<AdDraftState>(defaultDraft());
  const draft = history.state;
  const setDraft = history.setState;
  const hydratedRef = useRef(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [device, setDevice] = useState<"mobile" | "tablet" | "desktop">("mobile");

  // Hidratação inicial: edição ou rascunho
  useEffect(() => {
    if (!open) return;
    if (hydratedRef.current) return;
    if (editing) {
      const e = editing as any;
      history.replace({
        templateId: e.template_id ?? null,
        templatePayload: e.template_payload ?? {},
        content: {
          title: editing.title ?? "",
          description: editing.description ?? "",
          ctaText: editing.cta_text ?? "Saiba Mais",
          targetUrl: editing.target_url ?? "",
          linkOpenTarget: (e.link_open_target as "_blank" | "_self") ?? "_blank",
        },
        media: { imageUrl: editing.image_url ?? "" },
        targeting: { ...defaultDraft().targeting, ...(e.targeting ?? {}) },
        schedule: {
          ...defaultDraft().schedule,
          startsAt: editing.starts_at ?? new Date().toISOString(),
          endsAt: editing.ends_at ?? "",
          ...(e.schedule ?? {}),
        },
        placement: editing.placement,
        priority: editing.priority ?? 0,
        isActive: editing.is_active,
      });
    } else {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          history.replace({ ...defaultDraft(), ...parsed });
        }
      } catch {
        /* ignore */
      }
    }
    hydratedRef.current = true;
  }, [open, editing, draftKey]);

  // Auto-save com debounce
  useEffect(() => {
    if (!open || !hydratedRef.current || editing) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        /* storage cheio */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft, draftKey, open, editing]);

  // Atalhos Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const isInput =
        target && ["INPUT", "TEXTAREA"].includes(target.tagName) && !e.shiftKey && k === "z";
      if (isInput) return; // deixa undo nativo do input
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, history]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  const reset = useCallback(() => {
    history.replace(defaultDraft());
    setStepIndex(0);
    hydratedRef.current = false;
    clearDraft();
  }, [clearDraft, history]);

  // Validação por step
  const stepErrors = useMemo(() => {
    const errs: Record<StepKey, string | null> = {
      template: null,
      content: null,
      media: null,
      targeting: null,
      schedule: null,
      preview: null,
    };
    const c = contentSchema.safeParse(draft.content);
    if (!c.success) errs.content = c.error.errors[0]?.message ?? "Inválido";
    const m = mediaSchema.safeParse(draft.media);
    if (!m.success) errs.media = m.error.errors[0]?.message ?? "Imagem obrigatória";
    const t = targetingSchema.safeParse(draft.targeting);
    if (!t.success) errs.targeting = t.error.errors[0]?.message ?? "Segmentação inválida";
    if (draft.targeting.ageMin > draft.targeting.ageMax)
      errs.targeting = "Faixa etária inválida";
    const s = scheduleSchema.safeParse(draft.schedule);
    if (!s.success) errs.schedule = s.error.errors[0]?.message ?? "Agenda inválida";
    return errs;
  }, [draft]);

  const currentStep = STEPS[stepIndex];
  const canAdvance = !stepErrors[currentStep.key];

  const handleClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      // Limpa rascunho ao fechar (regra do usuário: só preservar entre navegações,
      // limpar ao cancelar/X). Apenas em modo "novo" — edições não persistem rascunho.
      if (!editing) reset();
    }
  };

  const buildPayload = (publishMode: "publish" | "draft" | "schedule") => {
    const isFuture =
      publishMode === "schedule" &&
      draft.schedule.startsAt &&
      new Date(draft.schedule.startsAt).getTime() > Date.now();
    return {
      title: draft.content.title,
      description: draft.content.description || null,
      image_url: draft.media.imageUrl,
      target_url: draft.content.targetUrl || null,
      cta_text: draft.content.ctaText,
      placement: draft.placement,
      priority: draft.priority,
      starts_at: draft.schedule.startsAt,
      ends_at: draft.schedule.endsAt || null,
      is_active: publishMode === "publish" ? draft.isActive : publishMode === "schedule" ? false : false,
      // Campos estendidos (Fase 1)
      targeting: draft.targeting,
      schedule: draft.schedule,
      template_id: draft.templateId,
      template_payload: draft.templatePayload,
      link_open_target: draft.content.linkOpenTarget,
      is_draft: publishMode === "draft",
    } as any;
  };

  const validateAll = () => {
    const blockers: string[] = [];
    Object.entries(stepErrors).forEach(([k, v]) => {
      if (v) blockers.push(`${k}: ${v}`);
    });
    return blockers;
  };

  const handleSubmit = async (mode: "publish" | "draft" | "schedule") => {
    if (mode !== "draft") {
      const blockers = validateAll();
      if (blockers.length) {
        toast.error("Preencha os campos obrigatórios", { description: blockers[0] });
        return;
      }
    } else if (!draft.content.title.trim()) {
      toast.error("Defina ao menos um título para salvar o rascunho");
      return;
    }
    try {
      const payload = buildPayload(mode);
      if (editing) {
        await updateAd.mutateAsync({ id: editing.id, ...payload });
        toast.success("Anúncio atualizado!");
      } else {
        await createAd.mutateAsync(payload);
        toast.success(
          mode === "draft"
            ? "Rascunho salvo!"
            : mode === "schedule"
              ? "Anúncio agendado!"
              : "Anúncio publicado!",
        );
      }
      handleClose(false);
      reset();
    } catch (err: any) {
      toast.error("Erro ao salvar", { description: err?.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "p-0 gap-0 max-w-3xl w-[100vw] sm:w-[calc(100vw-2rem)] md:w-full",
          "max-h-[100dvh] sm:max-h-[92vh] h-[100dvh] sm:h-auto",
          "rounded-none sm:rounded-lg border-0 sm:border",
          "flex flex-col overflow-hidden",
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <VisuallyHidden.Root><DialogTitle>Criar Anúncio</DialogTitle><DialogDescription>Wizard de criação de anúncio</DialogDescription></VisuallyHidden.Root>
        {/* Header — shrink-0 garante que não seja comprimido */}
        <div className="shrink-0 flex items-center justify-between px-3 sm:px-6 py-2.5 border-b border-border bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base truncate leading-tight">
                {editing ? "Editar Anúncio" : "Criar Anúncio"}
              </h2>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate leading-tight">
                {currentStep.label} · {stepIndex + 1}/{STEPS.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={history.undo}
              disabled={!history.canUndo}
              aria-label="Desfazer"
              title="Desfazer (Ctrl+Z)"
              className="h-8 w-8"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={history.redo}
              disabled={!history.canRedo}
              aria-label="Refazer"
              title="Refazer (Ctrl+Y)"
              className="h-8 w-8"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleClose(false)} aria-label="Fechar" className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stepper — shrink-0 + altura mínima garantida (corrige corte das guias) */}
        <div className="shrink-0 border-b border-border bg-muted/30">
          <div
            className="px-2 sm:px-4 py-2 overflow-x-auto overflow-y-hidden no-scrollbar"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex items-center gap-1 min-w-max">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const active = i === stepIndex;
                const completed = i < stepIndex && !stepErrors[s.key];
                const hasErr = stepErrors[s.key] && i < stepIndex;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStepIndex(i)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : completed
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : hasErr
                            ? "bg-destructive/15 text-destructive"
                            : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {completed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    ) : hasErr ? (
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Conteúdo do step (scroll invisível) — min-h-0 essencial pro flex */}
        <div
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 sm:px-6 py-3 sm:py-4"
          style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", contain: "content" }}
        >
          {currentStep.key === "template" && (
            <StepTemplate draft={draft} setDraft={setDraft} />
          )}
          {currentStep.key === "content" && (
            <StepContent draft={draft} setDraft={setDraft} error={stepErrors.content} />
          )}
          {currentStep.key === "media" && (
            <StepMedia draft={draft} setDraft={setDraft} error={stepErrors.media} />
          )}
          {currentStep.key === "targeting" && (
            <StepTargeting draft={draft} setDraft={setDraft} error={stepErrors.targeting} />
          )}
          {currentStep.key === "schedule" && (
            <StepSchedule draft={draft} setDraft={setDraft} error={stepErrors.schedule} />
          )}
          {currentStep.key === "preview" && (
            <Suspense
              fallback={
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  Carregando preview…
                </div>
              }
            >
              <StepPreview
                draft={draft}
                setDraft={setDraft}
                device={device}
                onDeviceChange={setDevice}
                errors={stepErrors}
              />
            </Suspense>
          )}
        </div>

        {/* Footer de navegação — shrink-0 garante visibilidade no mobile */}
        <div className="shrink-0 border-t border-border bg-card px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 [padding-bottom:max(0.625rem,env(safe-area-inset-bottom))]">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </Button>

          {stepIndex < STEPS.length - 1 ? (
            <Button
              size="sm"
              onClick={() => {
                if (!canAdvance) {
                  toast.error(stepErrors[currentStep.key] ?? "Verifique os campos");
                  return;
                }
                setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
              }}
              className="gap-1 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90"
            >
              <span>Avançar</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSubmit("draft")}
                disabled={createAd.isPending || updateAd.isPending}
                className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Rascunho</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSubmit("schedule")}
                disabled={createAd.isPending || updateAd.isPending}
                className="gap-1 border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
              >
                <CalendarClock className="h-4 w-4" />
                <span className="hidden sm:inline">Agendar</span>
              </Button>
              <Button
                size="sm"
                onClick={() => handleSubmit("publish")}
                disabled={createAd.isPending || updateAd.isPending}
                className="gap-1 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:opacity-90"
              >
                <Send className="h-4 w-4" />
                <span>{editing ? "Salvar" : "Publicar"}</span>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// STEPS
// ============================================================

interface StepProps {
  draft: AdDraftState;
  setDraft: React.Dispatch<React.SetStateAction<AdDraftState>>;
  error?: string | null;
}

function StepTemplate({ draft, setDraft }: StepProps) {
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const { data: dbTemplates = [], isLoading } = useAdTemplates(category, search);

  const currentDoc = (draft.templatePayload?.doc as AdDoc | undefined) ?? null;

  const handleSaveDoc = (doc: AdDoc) => {
    // Sincroniza campos do backend a partir das primeiras camadas correspondentes
    const firstText = doc.layers.find((l) => l.kind === "text") as TextLayer | undefined;
    const firstImage = doc.layers.find((l) => l.kind === "image") as ImageLayer | undefined;
    const textLayers = doc.layers.filter((l) => l.kind === "text") as TextLayer[];
    setDraft((d) => ({
      ...d,
      templateId: "custom-doc",
      templatePayload: { ...d.templatePayload, doc, variant: "custom-doc" },
      content: {
        ...d.content,
        title: firstText?.text?.slice(0, 120) || d.content.title,
        description:
          textLayers[1]?.text?.slice(0, 280) ?? d.content.description ?? "",
      },
      media: {
        ...d.media,
        imageUrl: firstImage?.src || d.media.imageUrl,
      },
    }));
    toast.success("Template personalizado salvo");
  };


  // Combina templates built-in (sempre disponíveis) com os do DB
  const combined = useMemo(() => {
    const builtIn = BUILTIN_AD_TEMPLATES.map((b) => ({
      id: b.id,
      name: b.name,
      category: b.category,
      payload: b.payload as any,
      description: b.description,
      _isBuiltIn: true as const,
    }));
    const fromDb = (dbTemplates as any[]).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      payload: t.payload || {},
      description: t.description || "",
      _isBuiltIn: false as const,
    }));
    let all = [...builtIn, ...fromDb];
    if (category !== "all") all = all.filter((t) => t.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      all = all.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return all;
  }, [dbTemplates, category, search]);

  const pickTemplate = (t: (typeof combined)[number] | null) => {
    setDraft((d) => {
      const defaults = t?.payload?.defaults || {};
      const isEmpty = (v?: string) => !v || !v.trim();
      return {
        ...d,
        templateId: t?.id ?? null,
        templatePayload: t?.payload ?? {},
        content: {
          ...d.content,
          // Só preenche se o campo estiver vazio — preserva trabalho do usuário
          title: isEmpty(d.content.title) ? defaults.title ?? d.content.title : d.content.title,
          description: isEmpty(d.content.description) ? defaults.description ?? d.content.description : d.content.description,
          ctaText: !d.content.ctaText || d.content.ctaText === "Saiba Mais" ? defaults.ctaText ?? d.content.ctaText : d.content.ctaText,
        },
        media: {
          ...d.media,
          imageUrl: isEmpty(d.media.imageUrl) && defaults.imageUrl ? defaults.imageUrl : d.media.imageUrl,
        },
      };
    });
    toast.success(t ? `Template "${t.name}" aplicado` : "Começando do zero");
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Escolha um template</h3>
        <p className="text-xs text-muted-foreground">
          Modelos visuais reais com layout, copy e imagem de exemplo. Tudo é editável nos próximos passos.
        </p>
      </div>

      {/* Editor avançado livre (Canvas estilo PosterMyWall) */}
      <div className="rounded-lg border-2 border-primary/40 bg-gradient-to-r from-primary/10 via-fuchsia-500/10 to-primary/10 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            Editor avançado de canvas
          </p>
          <p className="text-xs text-muted-foreground">
            Crie do zero com camadas livres: textos, imagens, formas, fundos e centenas de fontes — como no PosterMyWall.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)}>
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            {currentDoc ? "Continuar editando" : "Abrir editor"}
          </Button>
          {currentDoc && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                setDraft((d) => ({
                  ...d,
                  templatePayload: { ...d.templatePayload, doc: undefined },
                }));
                toast.success("Edição personalizada removida");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <AdCanvasEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initialDoc={currentDoc}
        initialSize={{ width: 1080, height: 1350 }}
        onSave={handleSaveDoc}
      />


      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar template..."
            className="pl-8 h-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AD_TEMPLATE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Começar do zero */}
        <button
          type="button"
          onClick={() => pickTemplate(null)}
          className={cn(
            "aspect-[4/5] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 p-2 transition-colors",
            draft.templateId === null
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40",
          )}
        >
          <Plus className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs font-medium">Do zero</span>
          <span className="text-[10px] text-muted-foreground text-center">
            Sem template
          </span>
        </button>

        {combined.map((t) => {
          const selected = draft.templateId === t.id;
          const payload = t.payload as any;
          const d = payload?.defaults || {};
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTemplate(t)}
              className={cn(
                "group relative aspect-[4/5] rounded-lg border-2 overflow-hidden text-left transition-all bg-card",
                selected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/50",
              )}
              style={{ contain: "content" }}
              title={t.description}
            >
              {/* Preview real do template */}
              <div className="absolute inset-0">
                <AdTemplateRenderer
                  mode="thumb"
                  data={{
                    title: d.title || t.name,
                    description: d.description,
                    ctaText: d.ctaText || "Ver",
                    imageUrl: d.imageUrl,
                    payload: {
                      variant: payload?.variant || "classic",
                      accent: payload?.accent || "#ec4899",
                      bg: payload?.bg,
                      gradient: payload?.gradient,
                      badge: payload?.badge,
                      badgeStyle: payload?.badgeStyle,
                      titleFont: payload?.titleFont,
                      textOnDark: payload?.textOnDark,
                    },
                  }}
                />
              </div>

              {/* Rótulo embaixo no hover */}
              <div className="absolute inset-x-0 bottom-0 bg-background/95 backdrop-blur-sm border-t border-border/50 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] font-semibold truncate">{t.name}</p>
                <p className="text-[9px] text-muted-foreground capitalize truncate">{t.category}</p>
              </div>

              {selected && (
                <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow ring-2 ring-background">
                  <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </button>
          );
        })}

        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`sk-${i}`} className="aspect-[4/5] rounded-lg bg-muted animate-pulse" />
          ))}

        {!isLoading && combined.length === 0 && (
          <div className="col-span-full text-center text-xs text-muted-foreground py-6">
            Nenhum template encontrado para esse filtro.
          </div>
        )}
      </div>
    </div>
  );
}

function StepContent({ draft, setDraft, error }: StepProps) {
  const update = (patch: Partial<AdDraftState["content"]>) =>
    setDraft((d) => ({ ...d, content: { ...d.content, ...patch } }));
  const { loading: aiLoading, lastError: aiError, clearError, suggestCopy, cancel: cancelAi } = useAdAi();

  const handleAiCopy = async () => {
    const seed =
      draft.content.title?.trim() ||
      draft.content.description?.trim() ||
      "oferta exclusiva da plataforma Oculto para usuários +18";
    const result = await suggestCopy({ product: seed });
    if (result) {
      update({
        title: result.title,
        description: result.description,
        ctaText: result.cta_text,
      });
      toast.success("Copy gerada pela IA");
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-end">
        {aiError && (
          <div className="flex-1">
            <AdErrorAlert
              error={aiError}
              compact
              onAction={(a) => {
                if (a === "retry") handleAiCopy();
                else if (a === "cancel") clearError();
              }}
              onDismiss={clearError}
            />
          </div>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAiCopy}
            disabled={aiLoading}
            className="gap-1.5"
          >
            {aiLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : aiError ? (
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {aiLoading ? "Gerando..." : aiError ? "Tentar novamente" : "Gerar com IA"}
          </Button>
          {aiLoading && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={cancelAi}
              className="h-8 gap-1 text-destructive"
              title="Cancelar geração"
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </div>



      <div className="space-y-1.5">
        <Label className="text-xs">Título *</Label>
        <Input
          value={draft.content.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Ex: Upgrade para VIP"
          maxLength={120}
        />
        <p className="text-[10px] text-muted-foreground text-right">
          {draft.content.title.length}/120
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Descrição</Label>
        <Textarea
          value={draft.content.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          rows={3}
          maxLength={280}
          placeholder="Texto curto que aparece abaixo do título"
        />
        <p className="text-[10px] text-muted-foreground text-right">
          {(draft.content.description ?? "").length}/280
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Texto do botão *</Label>
          <Input
            value={draft.content.ctaText}
            onChange={(e) => update({ ctaText: e.target.value })}
            placeholder="Saiba Mais"
            maxLength={40}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Abrir link em</Label>
          <Select
            value={draft.content.linkOpenTarget}
            onValueChange={(v) => update({ linkOpenTarget: v as "_blank" | "_self" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_blank">Nova aba</SelectItem>
              <SelectItem value="_self">Mesma janela</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">URL de destino (CTA)</Label>
        <Input
          type="url"
          inputMode="url"
          value={draft.content.targetUrl ?? ""}
          onChange={(e) => update({ targetUrl: e.target.value })}
          placeholder="https://exemplo.com/oferta"
        />
        <p className="text-[10px] text-muted-foreground">
          Aceita deep links (ex: <code>/subscriptions</code>) ou URLs completas.
        </p>
      </div>
    </div>
  );
}

function StepMedia({ draft, setDraft, error }: StepProps) {
  const [uploading, setUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { loading: aiLoading, lastError: aiError, clearError, extractFromImage, cancel: cancelAi } = useAdAi();

  const update = (patch: Partial<AdDraftState["media"]>) =>
    setDraft((d) => ({ ...d, media: { ...d.media, ...patch } }));

  const handleExtract = async () => {
    const result = await extractFromImage(draft.media.imageUrl);
    if (!result) return;
    setDraft((d) => ({
      ...d,
      content: {
        ...d.content,
        title: d.content.title || result.title,
        description: d.content.description || result.description,
        ctaText: d.content.ctaText && d.content.ctaText !== "Saiba Mais" ? d.content.ctaText : result.cta_text,
      },
      templatePayload: {
        ...d.templatePayload,
        accent: result.accent_color,
        palette: result.dominant_palette,
      },
    }));
    toast.success("Conteúdo extraído da imagem");
  };


  // Compressão local em WebP (canvas) — celular fraco friendly, sem libs.
  const compressToWebP = async (file: File, maxDim = 1600, quality = 0.82): Promise<string> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/webp", quality);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 8MB)");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await compressToWebP(file);
      update({ imageUrl: dataUrl });
      toast.success("Imagem otimizada");
    } catch (err: any) {
      toast.error("Falha ao processar imagem", { description: err?.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">URL da imagem *</Label>
        <Input
          value={draft.media.imageUrl}
          onChange={(e) => update({ imageUrl: e.target.value })}
          placeholder="https://... ou faça upload abaixo"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          <ImageIcon className="h-4 w-4" />
          {uploading ? "Otimizando..." : "Enviar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowLibrary((v) => !v)}
          className="gap-1.5"
        >
          <Library className="h-4 w-4" />
          {showLibrary ? "Ocultar biblioteca" : "Biblioteca"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExtract}
          disabled={!draft.media.imageUrl || aiLoading}
          className="gap-1.5"
          title="Usa IA Vision para gerar título, descrição e cores da imagem"
        >
          {aiLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : aiError ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}
          {aiLoading ? "Analisando..." : "Extrair com IA"}
        </Button>
        {aiLoading && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelAi}
            className="gap-1.5 text-destructive"
            title="Cancelar análise"
          >
            <X className="h-3.5 w-3.5" /> Cancelar
          </Button>
        )}
        {draft.media.imageUrl && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCropOpen(true)}
              className="gap-1.5"
              title="Recortar e ajustar"
            >
              <Crop className="h-3.5 w-3.5" /> Recortar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => update({ imageUrl: "" })}
              className="text-destructive gap-1.5 ml-auto"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </Button>
          </>
        )}
      </div>

      <AdImageCropper
        open={cropOpen}
        onOpenChange={setCropOpen}
        imageUrl={draft.media.imageUrl}
        onApply={(dataUrl) => {
          update({ imageUrl: dataUrl });
          toast.success("Imagem recortada aplicada");
        }}
      />


      {aiError && (
        <AdErrorAlert
          error={aiError}
          compact
          onAction={(a) => {
            if (a === "retry") handleExtract();
            else if (a === "cancel") clearError();
          }}
          onDismiss={clearError}
        />
      )}


      {showLibrary && (
        <StockImageLibrary
          defaultQuery={draft.content.title || "abstrato"}
          onPick={(url) => {
            update({ imageUrl: url });
            toast.success("Imagem aplicada");
          }}
        />
      )}

      {draft.media.imageUrl && (
        <div className="rounded-lg overflow-hidden border border-border">
          <img
            src={draft.media.imageUrl}
            alt="Preview"
            loading="lazy"
            decoding="async"
            className="w-full h-auto max-h-72 object-contain bg-muted"
          />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Imagens enviadas são comprimidas para WebP (até 1600px). A biblioteca usa Unsplash gratuito.
        "Extrair com IA" gera copy automática + paleta com base na imagem.
      </p>
    </div>
  );
}

function StepTargeting({ draft, setDraft, error }: StepProps) {
  const [interestInput, setInterestInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const t = draft.targeting;
  const update = (patch: Partial<AdDraftState["targeting"]>) =>
    setDraft((d) => ({ ...d, targeting: { ...d.targeting, ...patch } }));

  const toggleGender = (g: "all" | "male" | "female" | "nonbinary") => {
    if (g === "all") return update({ genders: ["all"] });
    const next = t.genders.filter((x) => x !== "all" && x !== g);
    if (!t.genders.includes(g)) next.push(g);
    update({ genders: next.length ? next : ["all"] });
  };

  const addInterest = () => {
    const v = interestInput.trim();
    if (!v || t.interests.includes(v) || t.interests.length >= 20) return;
    update({ interests: [...t.interests, v] });
    setInterestInput("");
  };
  const addCity = () => {
    const v = cityInput.trim();
    if (!v || t.cities.includes(v) || t.cities.length >= 50) return;
    update({ cities: [...t.cities, v] });
    setCityInput("");
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Faixa etária ({t.ageMin} - {t.ageMax} anos)</Label>
        <Slider
          min={18}
          max={80}
          step={1}
          value={[t.ageMin, t.ageMax]}
          onValueChange={([a, b]) => update({ ageMin: a, ageMax: b })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Gênero</Label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { v: "all", label: "Todos" },
              { v: "male", label: "Homens" },
              { v: "female", label: "Mulheres" },
              { v: "nonbinary", label: "Não-binário" },
            ] as const
          ).map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => toggleGender(v)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                t.genders.includes(v)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Cidades / Localização</Label>
        <div className="flex gap-1.5">
          <Input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCity())}
            placeholder="Ex: São Paulo, Rio de Janeiro"
            className="h-9"
          />
          <Button size="sm" variant="outline" onClick={addCity} disabled={!cityInput.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {t.cities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {t.cities.map((c) => (
              <Badge key={c} variant="secondary" className="gap-1">
                {c}
                <button
                  type="button"
                  onClick={() => update({ cities: t.cities.filter((x) => x !== c) })}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">
            Raio (km) — 0 = ignorar
          </Label>
          <Slider
            min={0}
            max={500}
            step={10}
            value={[t.radiusKm]}
            onValueChange={([v]) => update({ radiusKm: v })}
          />
          <p className="text-[10px] text-muted-foreground">
            {t.radiusKm === 0 ? "Sem raio definido" : `Até ${t.radiusKm} km`}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Interesses</Label>
        <div className="flex gap-1.5">
          <Input
            value={interestInput}
            onChange={(e) => setInterestInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInterest())}
            placeholder="Ex: moda fitness, tecnologia"
            className="h-9"
          />
          <Button size="sm" variant="outline" onClick={addInterest} disabled={!interestInput.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {t.interests.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {t.interests.map((it) => (
              <Badge key={it} variant="outline" className="gap-1">
                {it}
                <button
                  type="button"
                  onClick={() => update({ interests: t.interests.filter((x) => x !== it) })}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground border-l-2 border-primary/40 pl-2">
        Sem nenhum filtro, o anúncio aparece para <strong>todos os usuários gratuitos</strong>.
      </p>
    </div>
  );
}

function StepSchedule({ draft, setDraft, error }: StepProps) {
  const s = draft.schedule;
  const update = (patch: Partial<AdDraftState["schedule"]>) =>
    setDraft((d) => ({ ...d, schedule: { ...d.schedule, ...patch } }));

  const startDate = s.startsAt ? new Date(s.startsAt) : new Date();
  const endDate = s.endsAt ? new Date(s.endsAt) : undefined;

  const toggleWeekday = (d: number) => {
    const next = s.weekdays.includes(d) ? s.weekdays.filter((x) => x !== d) : [...s.weekdays, d];
    update({ weekdays: next });
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Início</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarClock className="mr-2 h-4 w-4" />
                {format(startDate, "dd/MM/yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComp
                mode="single"
                selected={startDate}
                onSelect={(d) => d && update({ startsAt: d.toISOString() })}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Término (opcional)</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarClock className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Sem prazo"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComp
                mode="single"
                selected={endDate}
                onSelect={(d) => update({ endsAt: d?.toISOString() ?? "" })}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Janela horária</Label>
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="time"
            value={s.hourStart}
            onChange={(e) => update({ hourStart: e.target.value })}
          />
          <Input
            type="time"
            value={s.hourEnd}
            onChange={(e) => update({ hourEnd: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Dias da semana (vazio = todos)</Label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS_PT.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleWeekday(i)}
              className={cn(
                "h-9 w-12 rounded-md text-xs font-semibold border transition-colors",
                s.weekdays.includes(i)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Recorrência</Label>
        <Select value={s.recurrence} onValueChange={(v) => update({ recurrence: v as any })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem recorrência</SelectItem>
            <SelectItem value="daily">Diariamente</SelectItem>
            <SelectItem value="weekly">Semanalmente</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function StepPreview({
  draft,
  setDraft,
  device,
  onDeviceChange,
  errors,
}: StepProps & {
  device: "mobile" | "tablet" | "desktop";
  onDeviceChange: (d: "mobile" | "tablet" | "desktop") => void;
  errors: Record<StepKey, string | null>;
}) {
  const blockers = Object.entries(errors).filter(([, v]) => v) as [StepKey, string][];
  const [exportOpen, setExportOpen] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotKey | null>("title");

  const overrides = (draft.templatePayload?.overrides as AdOverrides | undefined) ?? {};

  const setOverridesPayload = (next: AdOverrides) => {
    setDraft((d) => ({
      ...d,
      templatePayload: { ...d.templatePayload, overrides: next },
    }));
  };

  const handleChangeOverride = (slot: SlotKey, value: { dx: number; dy: number; scale: number }) => {
    setOverridesPayload(setOverride(overrides, device, slot, value));
  };

  const nudge = (slot: SlotKey, axis: "x" | "y", delta: number) => {
    const cur = overrides[device]?.[slot] ?? { dx: 0, dy: 0, scale: 1 };
    handleChangeOverride(slot, {
      ...cur,
      dx: axis === "x" ? cur.dx + delta : cur.dx,
      dy: axis === "y" ? cur.dy + delta : cur.dy,
    });
  };

  const setScale = (slot: SlotKey, scale: number) => {
    const cur = overrides[device]?.[slot] ?? { dx: 0, dy: 0, scale: 1 };
    handleChangeOverride(slot, { ...cur, scale });
  };

  const resetSlot = (slot: SlotKey) => {
    setOverridesPayload(setOverride(overrides, device, slot, null));
  };

  const resetDevice = () => {
    const next: AdOverrides = { ...overrides };
    delete next[device];
    setOverridesPayload(next);
    toast.success(`Layout do ${device} resetado`);
  };

  const safeName =
    (draft.content.title || "anuncio")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "anuncio";

  const curSlotVal = selectedSlot ? overrides[device]?.[selectedSlot] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant={layoutEditing ? "default" : "outline"}
          onClick={() => setLayoutEditing((v) => !v)}
          className={cn(
            "gap-1.5",
            layoutEditing && "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
          )}
          title="Reposicionar título, descrição e CTA por dispositivo"
        >
          <Move className="h-3.5 w-3.5" />
          {layoutEditing ? "Concluir edição" : "Editar layout"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setFullscreenOpen(true)}
          className="gap-1.5"
          title="Revisar em tela cheia com zoom e troca rápida de dispositivo"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Tela cheia
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setExportOpen(true)}
          className="gap-1.5"
          title="Mostra uma prévia do PNG antes de baixar/copiar"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar (PNG)
        </Button>
      </div>

      <AdExportPreviewModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        filename={`preview-${safeName}.png`}
        ad={{
          title: draft.content.title,
          description: draft.content.description,
          ctaText: draft.content.ctaText,
          imageUrl: draft.media.imageUrl,
          accent: (draft.templatePayload?.accent as string) || undefined,
          badge: (draft.templatePayload?.badge as string) || undefined,
        }}
      />

      <AdFullscreenPreview
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        draft={draft}
      />

      <AdLivePreview
        draft={draft}
        device={device}
        onDeviceChange={onDeviceChange}
        editing={layoutEditing}
        selectedSlot={selectedSlot}
        onSelectSlot={setSelectedSlot}
        onChangeOverride={handleChangeOverride}
      />

      {layoutEditing && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              {(["title", "description", "cta"] as SlotKey[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedSlot(s)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors capitalize",
                    selectedSlot === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50",
                  )}
                >
                  {s === "title" ? "Título" : s === "description" ? "Descrição" : "CTA"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] uppercase">{device}</Badge>
              <Button size="sm" variant="ghost" onClick={() => selectedSlot && resetSlot(selectedSlot)} className="h-7 gap-1 text-xs">
                <RotateCcw className="h-3 w-3" /> Slot
              </Button>
              <Button size="sm" variant="ghost" onClick={resetDevice} className="h-7 gap-1 text-xs text-destructive">
                <RotateCcw className="h-3 w-3" /> Dispositivo
              </Button>
            </div>
          </div>

          {selectedSlot && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div className="flex items-center justify-center gap-1.5">
                <div className="grid grid-cols-3 gap-1">
                  <span />
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => nudge(selectedSlot, "y", -2)}><ChevronLeft className="h-3 w-3 rotate-90" /></Button>
                  <span />
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => nudge(selectedSlot, "x", -2)}><ChevronLeft className="h-3 w-3" /></Button>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => selectedSlot && resetSlot(selectedSlot)} title="Centro"><Move className="h-3 w-3" /></Button>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => nudge(selectedSlot, "x", 2)}><ChevronRight className="h-3 w-3" /></Button>
                  <span />
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => nudge(selectedSlot, "y", 2)}><ChevronRight className="h-3 w-3 rotate-90" /></Button>
                  <span />
                </div>
                <div className="text-[10px] text-muted-foreground ml-2">
                  <div>X: {(curSlotVal?.dx ?? 0).toFixed(1)}%</div>
                  <div>Y: {(curSlotVal?.dy ?? 0).toFixed(1)}%</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Escala: {((curSlotVal?.scale ?? 1) * 100).toFixed(0)}%</Label>
                <Slider
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={[curSlotVal?.scale ?? 1]}
                  onValueChange={([v]) => setScale(selectedSlot, v)}
                />
              </div>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Dica: arraste diretamente no preview. Cada dispositivo tem sua própria posição salva.
          </p>
        </div>
      )}





      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Posição</Label>
          <Select
            value={draft.placement}
            onValueChange={(v) =>
              setDraft((d) => ({ ...d, placement: v as AdCampaign["placement"] }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLACEMENT_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Prioridade</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) || 0 }))}
          />
        </div>
        <div className="flex items-end justify-between gap-2 border border-border rounded-md px-3 py-2">
          <Label className="text-xs">Ativo ao publicar</Label>
          <Switch
            checked={draft.isActive}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
          />
        </div>
      </div>

      {blockers.length > 0 && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 space-y-1">
          <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Antes de publicar, corrija:
          </p>
          <ul className="text-[11px] text-destructive space-y-0.5 pl-5 list-disc">
            {blockers.map(([k, v]) => (
              <li key={k}>
                <span className="capitalize">{k}</span>: {v}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
