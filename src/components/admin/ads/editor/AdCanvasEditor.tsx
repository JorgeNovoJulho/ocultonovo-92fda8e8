import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from "@/components/ui/button";
import {
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, X, Check, Plus, Copy, Trash2, Play,
  Download, Save, Grid3x3, Upload,
  AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from "lucide-react";
import { pickAndImportTemplate } from "./importTemplate";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeftSidebar } from "./panels/LeftSidebar";
import { RightInspector } from "./panels/RightInspector";
import { LayersPanel } from "./panels/LayersPanel";
import { CanvasStage } from "./CanvasStage";
import { LayerRenderer } from "./LayerRenderer";
import { useEditorStore } from "./useEditorStore";
import { AdDoc, emptyDoc } from "./layerTypes";
import { preloadFonts } from "./fontsCatalog";
import { exportPage, downloadDataUrl } from "./exportImage";
import { loadDraft, saveDraft, clearDraft } from "./draftStorage";
import { useUserAdTemplates } from "./hooks/useUserAdTemplates";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  initialDoc?: AdDoc | null;
  initialSize?: { width: number; height: number };
  /** Recebe o doc raiz; páginas adicionais ficam em doc.pages. */
  onSave: (doc: AdDoc) => void;
}

export function AdCanvasEditor({ open, onClose, initialDoc, initialSize, onSave }: Props) {
  const {
    doc, zoom, setZoom, undo, redo, past, future, loadDoc,
    pages, currentPageIndex, addPage, duplicatePage, removePage, switchPage,
    getProjectDoc,
    selectedIds, alignSelected, distributeSelected, copySelection, pasteClipboard,
  } = useEditorStore();

  const { save: saveUserTemplate, userId: templatesUserId } = useUserAdTemplates();

  const [previewKey, setPreviewKey] = useState(0);
  const [exporting, setExporting] = useState<null | "png" | "jpeg">(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const draftPromptedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    draftPromptedRef.current = false;

    const draft = loadDraft();
    const hasInitial = !!(initialDoc && initialDoc.layers?.length);
    if (draft && !hasInitial && !draftPromptedRef.current) {
      draftPromptedRef.current = true;
      const minutes = Math.max(1, Math.round((Date.now() - draft.savedAt) / 60000));
      const restore = window.confirm(
        `Rascunho encontrado (salvo há ~${minutes} min). Deseja restaurar?`,
      );
      if (restore) {
        loadDoc(draft.doc);
        preloadFonts(draft.doc.layers.filter((l) => l.kind === "text").map((l: any) => l.fontFamily));
        return;
      }
      clearDraft();
    }

    if (initialDoc && initialDoc.layers) {
      loadDoc(initialDoc);
      const allLayers = [
        ...initialDoc.layers,
        ...(initialDoc.pages ?? []).flatMap((p) => p.layers),
      ];
      preloadFonts(allLayers.filter((l) => l.kind === "text").map((l: any) => l.fontFamily));
    } else {
      const size = initialSize ?? { width: 1080, height: 1350 };
      loadDoc(emptyDoc(size.width, size.height));
    }
    requestAnimationFrame(() => {
      const w = window.innerWidth - 420;
      const h = window.innerHeight - 220;
      const d = initialDoc ?? emptyDoc(initialSize?.width ?? 1080, initialSize?.height ?? 1350);
      const fit = Math.min(w / d.width, h / d.height) * 0.9;
      setZoom(Math.max(0.1, Math.min(1, fit)));
    });
  }, [open, initialDoc, initialSize, loadDoc, setZoom]);

  // Escuta toggles do painel Design para Grelha (Guias/Dobras/Transbordo são informativos por ora)
  useEffect(() => {
    const onGrid = (e: Event) => setShowGrid(!!(e as CustomEvent).detail);
    window.addEventListener("oculto-editor:set-grid", onGrid);
    return () => window.removeEventListener("oculto-editor:set-grid", onGrid);
  }, []);

  // Autosave do rascunho a cada 4s enquanto o editor está aberto
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      try {
        saveDraft(getProjectDoc());
      } catch {
        /* noop */
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [open, getProjectDoc]);

  const fit = () => {
    const w = window.innerWidth - 420;
    const h = window.innerHeight - 220;
    const f = Math.min(w / doc.width, h / doc.height) * 0.9;
    setZoom(Math.max(0.1, Math.min(1, f)));
  };

  const handleSave = () => {
    onSave(getProjectDoc());
    clearDraft();
    onClose();
  };

  const handleManualSaveDraft = () => {
    saveDraft(getProjectDoc());
    toast.success("Rascunho salvo localmente");
  };

  const handleExport = async (format: "png" | "jpeg", all = false) => {
    try {
      setExporting(format);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const list = all ? pages : [doc];
      for (let i = 0; i < list.length; i++) {
        const dataUrl = await exportPage(list[i], format, { pixelRatio: 2 });
        const suffix = all ? `-p${String(i + 1).padStart(2, "0")}` : "";
        downloadDataUrl(
          dataUrl,
          `oculto-ad-${ts}${suffix}.${format === "jpeg" ? "jpg" : "png"}`,
        );
        // pequena pausa para o browser não bloquear downloads em sequência
        if (all && i < list.length - 1) await new Promise((r) => setTimeout(r, 250));
      }
      toast.success(
        all
          ? `${list.length} páginas exportadas em ${format.toUpperCase()}`
          : `Exportado como ${format.toUpperCase()}`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar imagem");
    } finally {
      setExporting(null);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templatesUserId) {
      toast.error("Faça login para salvar templates.");
      return;
    }
    const name = window.prompt("Nome do template:", "Meu template");
    if (name == null) return;
    try {
      setSavingTemplate(true);
      const projectDoc = getProjectDoc();
      // Thumbnail JPEG leve da página atual
      let thumb: string | null = null;
      try {
        thumb = await exportPage(doc, "jpeg", { pixelRatio: 0.4, quality: 0.7 });
      } catch (e) {
        console.warn("thumbnail falhou", e);
      }
      await saveUserTemplate(name, projectDoc, thumb);
      toast.success("Template salvo em “Meus templates”");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Falha ao salvar template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleImportTemplate = async () => {
    try {
      const imported = await pickAndImportTemplate();
      if (!imported) return;
      const ok =
        !doc.layers.length ||
        window.confirm("Importar template substituirá o conteúdo atual. Continuar?");
      if (!ok) return;
      loadDoc(imported);
      preloadFonts(
        [
          ...imported.layers,
          ...(imported.pages ?? []).flatMap((p) => p.layers),
        ]
          .filter((l: any) => l.kind === "text")
          .map((l: any) => l.fontFamily),
      );
      toast.success("Template importado");
      requestAnimationFrame(() => fit());
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Falha ao importar template");
    }
  };



  // Atalhos: Ctrl/Cmd+C / +V (copy/paste), +Z (undo), +Shift+Z ou +Y (redo)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "c") {
        if (selectedIds.length) { e.preventDefault(); copySelection(); }
      } else if (k === "v") {
        e.preventDefault();
        pasteClipboard();
      } else if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, selectedIds, copySelection, pasteClipboard, undo, redo]);

  const hasMultiSel = selectedIds.length >= 2;
  const canDistribute = selectedIds.length >= 3;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-none w-screen h-screen p-0 gap-0 border-0 rounded-none flex flex-col">
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
        {/* Toolbar */}
        <div className="h-12 border-b border-border bg-card flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center gap-2">

            <h2 className="text-sm font-semibold">Editor de template</h2>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {doc.width} × {doc.height}px · {pages.length} {pages.length === 1 ? "página" : "páginas"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" disabled={!past.length} onClick={undo} title="Desfazer (Ctrl+Z)" aria-label="Ação">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" disabled={!future.length} onClick={redo} title="Refazer (Ctrl+Shift+Z / Ctrl+Y)" aria-label="Ação">
              <Redo2 className="h-4 w-4" />
            </Button>
            <span className="mx-1 w-px h-5 bg-border" />
            <Button size="icon" variant="ghost" onClick={() => setZoom(zoom - 0.1)}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" onClick={() => setZoom(zoom + 0.1)}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={fit} title="Ajustar" aria-label="Expandir">
              <Maximize2 className="h-4 w-4" />
            </Button>
            <span className="mx-1 w-px h-5 bg-border" />
            <Button size="icon" variant="ghost" onClick={() => setPreviewKey((k) => k + 1)} title="Pré-visualizar animações">
              <Play className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleImportTemplate}
              title="Importar template (.json, .png, .jpg, .webp, .svg)"
            >
              <Upload className="h-4 w-4 mr-1" /> Importar
            </Button>
            <Button size="sm" variant="ghost" onClick={handleManualSaveDraft} title="Salvar rascunho local">
              <Save className="h-4 w-4 mr-1" /> Rascunho
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSaveAsTemplate}
              disabled={savingTemplate}
              title="Salvar como template reutilizável"
            >
              <BookmarkPlus className="h-4 w-4 mr-1" />
              {savingTemplate ? "Salvando…" : "Salvar template"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" disabled={!!exporting}>
                  <Download className="h-4 w-4 mr-1" />
                  {exporting ? "Exportando…" : "Exportar"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("png")}>PNG (página atual)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("jpeg")}>JPEG (página atual)</DropdownMenuItem>
                {pages.length > 1 && (
                  <>
                    <DropdownMenuItem onClick={() => handleExport("png", true)}>
                      PNG · todas as {pages.length} páginas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("jpeg", true)}>
                      JPEG · todas as {pages.length} páginas
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </div>
        </div>

        {/* Sub-toolbar: alinhamento, distribuição e grade */}
        <div className="h-10 border-b border-border bg-card/60 flex items-center gap-1 px-3 shrink-0 overflow-x-auto">
          <span className="text-[11px] text-muted-foreground mr-1">Alinhar:</span>
          <Button size="icon" variant="ghost" disabled={!selectedIds.length} onClick={() => alignSelected("left")} title="Esquerda">
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={!selectedIds.length} onClick={() => alignSelected("centerX")} title="Centralizar horizontal">
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={!selectedIds.length} onClick={() => alignSelected("right")} title="Direita">
            <AlignRight className="h-4 w-4" />
          </Button>
          <span className="mx-1 w-px h-5 bg-border" />
          <Button size="icon" variant="ghost" disabled={!selectedIds.length} onClick={() => alignSelected("top")} title="Topo">
            <AlignStartVertical className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={!selectedIds.length} onClick={() => alignSelected("centerY")} title="Centralizar vertical">
            <AlignCenterVertical className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={!selectedIds.length} onClick={() => alignSelected("bottom")} title="Base">
            <AlignEndVertical className="h-4 w-4" />
          </Button>
          <span className="mx-1 w-px h-5 bg-border" />
          <span className="text-[11px] text-muted-foreground mr-1">Distribuir:</span>
          <Button size="icon" variant="ghost" disabled={!canDistribute} onClick={() => distributeSelected("horizontal")} title="Espaçar horizontal (3+ camadas)">
            <AlignHorizontalDistributeCenter className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={!canDistribute} onClick={() => distributeSelected("vertical")} title="Espaçar vertical (3+ camadas)">
            <AlignVerticalDistributeCenter className="h-4 w-4" />
          </Button>
          <span className="mx-1 w-px h-5 bg-border" />
          <Button
            size="sm"
            variant={showGrid ? "secondary" : "ghost"}
            onClick={() => setShowGrid((g) => !g)}
            title="Mostrar/ocultar grade"
          >
            <Grid3x3 className="h-4 w-4 mr-1" /> Grade
          </Button>
          {hasMultiSel && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              {selectedIds.length} camadas selecionadas
            </span>
          )}
        </div>

        {/* Workspace */}
        <div className="flex-1 flex min-h-0">
          <LeftSidebar />
          <div className="flex-1 min-w-0 relative">
            <CanvasStage previewKey={previewKey} showGrid={showGrid} />
          </div>
          <LayersPanel />
          <RightInspector />
        </div>

        {/* Páginas (slides) */}
        <div className="h-24 border-t border-border bg-card flex items-center gap-2 px-3 overflow-x-auto shrink-0">
          {pages.map((p, i) => (
            <PageThumb
              key={i}
              doc={p}
              index={i}
              active={i === currentPageIndex}
              onSelect={() => switchPage(i)}
              onDuplicate={() => duplicatePage(i)}
              onRemove={pages.length > 1 ? () => removePage(i) : undefined}
            />
          ))}
          <Button size="sm" variant="outline" onClick={addPage} className="shrink-0 h-16 px-3">
            <Plus className="h-4 w-4 mr-1" /> Página
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PageThumb({
  doc, index, active, onSelect, onDuplicate, onRemove,
}: {
  doc: AdDoc;
  index: number;
  active: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove?: () => void;
}) {
  const W = 64;
  const H = (doc.height / doc.width) * W;
  const scale = W / doc.width;
  const bg = doc.backgroundImage
    ? `url(${doc.backgroundImage}) center/cover no-repeat, ${doc.background}`
    : doc.background;
  return (
    <div className={cn(
      "relative group shrink-0 rounded border-2 cursor-pointer overflow-hidden",
      active ? "border-primary" : "border-border hover:border-primary/50",
    )} style={{ width: W, height: H }} onClick={onSelect} title={`Página ${index + 1}`}>
      <div style={{ position: "absolute", inset: 0, background: bg, transform: `scale(${scale})`, transformOrigin: "top left", width: doc.width, height: doc.height }}>
        {doc.layers.map((l) => <LayerRenderer key={l.id} layer={l} />)}
      </div>
      <div className="absolute top-0 left-0 bg-background/80 text-[9px] px-1 leading-tight">
        {index + 1}
      </div>
      <div className="absolute bottom-0 right-0 flex opacity-0 group-hover:opacity-100 bg-background/80">
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="p-0.5 hover:text-primary" title="Duplicar">
          <Copy className="h-2.5 w-2.5" />
        </button>
        {onRemove && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-0.5 hover:text-destructive" title="Remover">
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}
