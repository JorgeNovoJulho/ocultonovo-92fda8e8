import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NotebookPen,
  Plus,
  Search,
  Pin,
  PinOff,
  Trash2,
  Check,
  Loader2,
  ArrowLeft,
  Bell,
  BellOff,
  Share2,
  Lightbulb,
  FolderKanban,
  User as UserIcon,
  Sparkles,
  Lock,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import { useUserNotes, type UserNote, type NoteCategory } from "@/hooks/useUserNotes";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

interface NotepadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FilterKey = "all" | "favorites" | "idea" | "project" | "personal";

const FILTERS: { key: FilterKey; label: string; icon: any; color: string }[] = [
  { key: "all",       label: "Todas",     icon: Sparkles,     color: "fuchsia" },
  { key: "favorites", label: "Favoritas", icon: Pin,          color: "amber" },
  { key: "idea",      label: "Ideias",    icon: Lightbulb,    color: "cyan" },
  { key: "project",   label: "Projetos",  icon: FolderKanban, color: "violet" },
  { key: "personal",  label: "Pessoais",  icon: UserIcon,     color: "rose" },
];

const CATEGORY_META: Record<NoteCategory, { label: string; icon: any; cls: string; ring: string }> = {
  idea:     { label: "IDEIA",    icon: Lightbulb,    cls: "bg-cyan-500/15 text-cyan-300 border-cyan-400/40",         ring: "ring-cyan-400/60" },
  project:  { label: "PROJETO",  icon: FolderKanban, cls: "bg-violet-500/15 text-violet-300 border-violet-400/40",   ring: "ring-violet-400/60" },
  personal: { label: "PESSOAL",  icon: UserIcon,     cls: "bg-rose-500/15 text-rose-300 border-rose-400/40",         ring: "ring-rose-400/60" },
  other:    { label: "NOTA",     icon: NotebookPen,  cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/40", ring: "ring-fuchsia-400/60" },
};

// ---------- Pré-visualização inteligente ----------
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i;
const YT_REGEX = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i;
const VIMEO_REGEX = /vimeo\.com\/(\d+)/i;
const INTERNAL_CREATOR = /\/creator\/([a-zA-Z0-9_.-]+)/i;
const INTERNAL_U = /\/u\/([a-zA-Z0-9_.-]+)/i;

function classifyUrl(u: string):
  | { kind: "image"; src: string }
  | { kind: "video"; src: string }
  | { kind: "audio"; src: string }
  | { kind: "youtube"; id: string }
  | { kind: "vimeo"; id: string }
  | { kind: "internal-profile"; handle: string; href: string }
  | { kind: "link"; href: string } {
  if (IMAGE_EXT.test(u)) return { kind: "image", src: u };
  if (VIDEO_EXT.test(u)) return { kind: "video", src: u };
  if (AUDIO_EXT.test(u)) return { kind: "audio", src: u };
  const yt = u.match(YT_REGEX);
  if (yt) return { kind: "youtube", id: yt[1] };
  const vm = u.match(VIMEO_REGEX);
  if (vm) return { kind: "vimeo", id: vm[1] };
  const ic = u.match(INTERNAL_CREATOR) || u.match(INTERNAL_U);
  if (ic) {
    try {
      const path = new URL(u).pathname;
      return { kind: "internal-profile", handle: ic[1], href: path };
    } catch {
      return { kind: "internal-profile", handle: ic[1], href: `/u/${ic[1]}` };
    }
  }
  return { kind: "link", href: u };
}

function renderTextWithMentions(text: string, keyBase: string) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_.-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") && part.length > 1) {
      const handle = part.slice(1);
      return (
        <Link key={`${keyBase}-m-${i}`} to={`/u/${handle}`} className="text-cyan-300 hover:underline font-medium">
          {part}
        </Link>
      );
    }
    return <span key={`${keyBase}-t-${i}`}>{part}</span>;
  });
}

function SmartPreview({ text }: { text: string }) {
  if (!text) return null;
  // Quebra preservando linhas; em cada linha, separa URLs do texto.
  const lines = text.split(/\r?\n/);
  const blocks: JSX.Element[] = [];

  lines.forEach((line, li) => {
    if (!line.trim()) {
      blocks.push(<div key={`br-${li}`} className="h-2" />);
      return;
    }
    const segments = line.split(URL_REGEX);
    const textBuffer: JSX.Element[] = [];
    const flushText = (k: string) => {
      if (textBuffer.length === 0) return;
      blocks.push(
        <p
          key={`p-${li}-${k}`}
          className="text-sm text-white/90 whitespace-pre-wrap break-words leading-relaxed"
        >
          {textBuffer.map((c) => c)}
        </p>,
      );
      textBuffer.length = 0;
    };

    segments.forEach((seg, si) => {
      if (!seg) return;
      if (URL_REGEX.test(seg)) {
        URL_REGEX.lastIndex = 0; // reset stateful regex
        const meta = classifyUrl(seg);
        // Antes de renderizar mídia, despeja texto pendente
        flushText(`pre-${si}`);
        const k = `u-${li}-${si}`;
        switch (meta.kind) {
          case "image":
            blocks.push(
              <a key={k} href={meta.src} target="_blank" rel="noreferrer" className="block">
                <img
                  src={meta.src}
                  alt="Pré-visualização"
                  loading="lazy"
                  className="max-h-72 w-full object-contain rounded-lg border border-fuchsia-400/30 bg-black/40"
                />
              </a>,
            );
            break;
          case "video":
            blocks.push(
              <video
                key={k}
                src={meta.src}
                controls
                preload="metadata"
                className="w-full max-h-72 rounded-lg border border-fuchsia-400/30 bg-black"
              />,
            );
            break;
          case "audio":
            blocks.push(
              <audio key={k} src={meta.src} controls className="w-full rounded-lg" />,
            );
            break;
          case "youtube":
            blocks.push(
              <div key={k} className="relative w-full aspect-video rounded-lg overflow-hidden border border-fuchsia-400/30 bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${meta.id}`}
                  title="YouTube"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>,
            );
            break;
          case "vimeo":
            blocks.push(
              <div key={k} className="relative w-full aspect-video rounded-lg overflow-hidden border border-fuchsia-400/30 bg-black">
                <iframe
                  src={`https://player.vimeo.com/video/${meta.id}`}
                  title="Vimeo"
                  loading="lazy"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>,
            );
            break;
          case "internal-profile":
            blocks.push(
              <Link
                key={k}
                to={meta.href}
                className="flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 hover:bg-cyan-500/15 transition-colors"
              >
                <UserIcon className="h-4 w-4 text-cyan-300 shrink-0" />
                <span className="text-sm font-semibold text-cyan-100 truncate">@{meta.handle}</span>
                <span className="text-[10px] text-cyan-300/70 ml-auto shrink-0">Perfil no Oculto</span>
              </Link>,
            );
            break;
          default:
            blocks.push(
              <a
                key={k}
                href={meta.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 hover:bg-white/[0.08] transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-fuchsia-400 shrink-0" />
                <span className="text-xs text-fuchsia-200/90 truncate break-all">{meta.href}</span>
              </a>,
            );
        }
      } else {
        textBuffer.push(
          <span key={`t-${li}-${si}`}>{renderTextWithMentions(seg, `${li}-${si}`)}</span>,
        );
      }
    });
    flushText("end");
  });

  return <div className="space-y-2">{blocks}</div>;
}


function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NotepadModal({ open, onOpenChange }: NotepadModalProps) {
  const { data: notes = [], isLoading, create, update, remove } = useUserNotes();
  const [view, setView] = useState<"list" | "editor">("list");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftCategory, setDraftCategory] = useState<NoteCategory>("other");
  const [draftPinned, setDraftPinned] = useState(false);
  const [draftReminder, setDraftReminder] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<number | null>(null);

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) || null,
    [notes, selectedId],
  );

  const filtered = useMemo(() => {
    let list = notes;
    if (filter === "favorites") list = list.filter((n) => n.pinned);
    else if (filter !== "all") list = list.filter((n) => n.category === filter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (n) => n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s),
      );
    }
    return list;
  }, [notes, filter, search]);

  useEffect(() => {
    if (selected) {
      setDraftTitle(selected.title);
      setDraftContent(selected.content);
      setDraftCategory((selected.category as NoteCategory) || "other");
      setDraftPinned(selected.pinned);
      setDraftReminder(selected.reminder_at);
      setSavingStatus("idle");
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save
  useEffect(() => {
    if (view !== "editor" || !selected) return;
    if (
      draftTitle === selected.title &&
      draftContent === selected.content &&
      draftCategory === (selected.category || "other") &&
      draftPinned === selected.pinned &&
      (draftReminder || null) === (selected.reminder_at || null)
    ) return;
    setSavingStatus("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await update.mutateAsync({
          id: selected.id,
          title: draftTitle,
          content: draftContent,
          category: draftCategory,
          pinned: draftPinned,
          reminder_at: draftReminder,
        } as any);
        setSavingStatus("saved");
        window.setTimeout(() => setSavingStatus("idle"), 1500);
      } catch {
        setSavingStatus("idle");
      }
    }, 800);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [draftTitle, draftContent, draftCategory, draftPinned, draftReminder, view, selected, update]);

  const handleCreate = async () => {
    const initialCategory: NoteCategory =
      filter === "idea" || filter === "project" || filter === "personal" ? filter : "other";
    const created = await create.mutateAsync({
      title: "Nova nota",
      content: "",
      color_tag: "default",
      pinned: false,
      category: initialCategory,
    } as any);
    setSelectedId(created.id);
    setView("editor");
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm("Excluir esta nota? Esta ação não pode ser desfeita.")) return;
    await remove.mutateAsync(selected.id);
    setSelectedId(null);
    setView("list");
  };

  const handleShare = async () => {
    if (!selected) return;
    const text = `${draftTitle || "Nota"}\n\n${draftContent || ""}`.trim();
    try {
      if (navigator.share) {
        await navigator.share({ title: draftTitle || "Nota do Oculto", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: "Nota copiada", description: "Conteúdo copiado para a área de transferência." });
      }
    } catch {
      /* user cancel */
    }
  };

  const totalReminders = notes.filter((n) => n.reminder_at).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden border border-fuchsia-500/30",
          "w-screen h-[100dvh] max-w-[100vw] max-h-[100dvh] rounded-none sm:rounded-2xl",
          "sm:w-[92vw] sm:max-w-3xl sm:h-[85vh] sm:max-h-[85vh]",
          "flex flex-col",
          "pb-[env(safe-area-inset-bottom)]",
          // Fundo SÓLIDO opaco — nada de transparência
          "!bg-[#0a0118] text-white shadow-[0_0_60px_rgba(217,70,239,0.25)]",
        )}
      >
        {/* Header neon */}
        <DialogHeader className="px-4 py-3 sm:px-5 sm:py-4 border-b border-fuchsia-500/20 shrink-0 bg-black/30 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center shrink-0 ring-1 ring-fuchsia-400/50 shadow-[0_0_18px_rgba(217,70,239,0.45)]">
              <NotebookPen className="h-5 w-5 text-fuchsia-200" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle
                className="text-base sm:text-xl font-extrabold tracking-wide leading-tight bg-gradient-to-r from-fuchsia-400 via-pink-300 to-cyan-300 bg-clip-text text-transparent"
              >
                BLOCO DE NOTAS
              </DialogTitle>
              <p className="text-[11px] text-fuchsia-200/70 leading-tight flex items-center gap-1.5">
                <Lock className="h-3 w-3" /> Só você tem a chave do que sente
              </p>
            </div>
            {view === "editor" && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-cyan-200/80">
                {savingStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                {savingStatus === "saved" && <Check className="h-3 w-3 text-emerald-400" />}
                <span>
                  {savingStatus === "saving" ? "Salvando..." : savingStatus === "saved" ? "Salvo" : "Auto-salvar"}
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* LIST */}
        {view === "list" && (
          <div className="flex-1 min-h-0 px-3 sm:px-5 py-3 sm:py-4 flex flex-col gap-3">
            {/* Busca + criar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fuchsia-300/70" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar notas..."
                  className="pl-9 bg-black/40 border-fuchsia-500/30 text-white placeholder:text-fuchsia-200/40 focus-visible:ring-fuchsia-400/60"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={create.isPending}
                className="gap-1.5 bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-400 hover:to-pink-400 text-white shadow-[0_0_14px_rgba(217,70,239,0.55)] border-0"
              >
                <Plus className="h-4 w-4" />
                Nova nota
              </Button>
            </div>

            {/* Abas categorias */}
            <ScrollArea className="-mx-1 px-1">
              <div className="flex gap-1.5 pb-1">
                {FILTERS.map((f) => {
                  const Icon = f.icon;
                  const active = filter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border",
                        active
                          ? f.color === "fuchsia" ? "bg-fuchsia-500/25 border-fuchsia-400/70 text-fuchsia-100 shadow-[0_0_12px_rgba(217,70,239,0.5)]"
                          : f.color === "amber"   ? "bg-amber-500/25 border-amber-400/70 text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.5)]"
                          : f.color === "cyan"    ? "bg-cyan-500/25 border-cyan-400/70 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                          : f.color === "violet"  ? "bg-violet-500/25 border-violet-400/70 text-violet-100 shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                          : "bg-rose-500/25 border-rose-400/70 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.5)]"
                          : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Banner lembretes */}
            {totalReminders > 0 && filter === "all" && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 flex items-center gap-2 text-xs text-emerald-200">
                <Bell className="h-3.5 w-3.5" />
                {totalReminders} {totalReminders === 1 ? "lembrete ativo" : "lembretes ativos"}
              </div>
            )}

            <ScrollArea className="flex-1 -mx-1 px-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-fuchsia-300/70">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="border border-dashed border-fuchsia-500/30 rounded-xl p-8 text-center text-sm text-fuchsia-200/70">
                  {search
                    ? "Nenhuma nota encontrada."
                    : "Seu bloco está vazio. Toque em \"Nova nota\" para começar."}
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((n) => {
                    const meta = CATEGORY_META[(n.category as NoteCategory) || "other"];
                    const Icon = meta.icon;
                    return (
                      <div
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedId(n.id);
                          setView("editor");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(n.id);
                            setView("editor");
                          }
                        }}
                        className={cn(
                          "relative w-full text-left p-3 rounded-xl border transition-all group cursor-pointer",
                          "bg-gradient-to-br from-white/[0.04] to-white/[0.01] border-white/10 hover:border-fuchsia-400/50",
                          "hover:shadow-[0_0_18px_rgba(217,70,239,0.25)]",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn("h-9 w-9 rounded-lg border flex items-center justify-center shrink-0", meta.cls)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0 pr-16">
                            <div className="flex items-center gap-2 mb-0.5">
                              {n.pinned && <Pin className="h-3.5 w-3.5 text-amber-300" />}
                              <h4 className="text-sm font-bold text-white truncate">
                                {n.title || "Sem título"}
                              </h4>
                              <Badge variant="secondary" className={cn("text-[9px] h-4 px-1.5 font-bold border", meta.cls)}>
                                {meta.label}
                              </Badge>
                              {n.reminder_at && (
                                <Bell className="h-3 w-3 text-emerald-300" />
                              )}
                            </div>
                            <p className="text-xs text-white/60 line-clamp-2 break-words">
                              {n.content || "Sem conteúdo"}
                            </p>
                            <p className="text-[10px] text-fuchsia-200/50 mt-1.5">
                              {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true, locale: ptBR })}
                              {n.reminder_at && (
                                <span className="ml-2 text-emerald-300/80">
                                  • lembrete {format(new Date(n.reminder_at), "dd/MM HH:mm")}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Ações rápidas: editar / excluir */}
                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(n.id);
                              setView("editor");
                            }}
                            className="h-7 w-7 rounded-md flex items-center justify-center bg-black/40 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/20"
                            aria-label="Editar nota"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Excluir a nota "${n.title || "Sem título"}"? Esta ação não pode ser desfeita.`)) return;
                              try {
                                await remove.mutateAsync(n.id);
                                if (selectedId === n.id) {
                                  setSelectedId(null);
                                  setView("list");
                                }
                              } catch {
                                /* toast já é emitido pelo hook */
                              }
                            }}
                            className="h-7 w-7 rounded-md flex items-center justify-center bg-black/40 border border-rose-400/40 text-rose-300 hover:bg-rose-500/20"
                            aria-label="Excluir nota"
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <div className="pt-1 flex items-center justify-center gap-3 text-[10px] text-fuchsia-200/60">
              <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> SEGURO</span>
              <span className="opacity-40">|</span>
              <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> PRIVADO</span>
              <span className="opacity-40">|</span>
              <span>SÓ VOCÊ TEM ACESSO</span>
            </div>
          </div>
        )}

        {/* EDITOR */}
        {view === "editor" && (
          <div className="flex-1 min-h-0 flex flex-col">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm text-fuchsia-200/60 px-3">
                Selecione uma nota para editar.
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 py-3 sm:py-4 flex flex-col gap-3">
                <div className="flex items-center gap-1 flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setView("list")}
                    className="text-white/70 hover:text-white hover:bg-white/10 px-2 sm:px-3"
                  >
                    <ArrowLeft className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Voltar</span>
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleShare}
                    className="text-cyan-200 hover:text-cyan-100 hover:bg-cyan-500/10 gap-1.5"
                  >
                    <Share2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Compartilhar</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraftPinned((p) => !p)}
                    className={cn("gap-1.5 hover:bg-amber-500/10", draftPinned ? "text-amber-300" : "text-white/60")}
                  >
                    {draftPinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                    <span className="hidden sm:inline">{draftPinned ? "Fixada" : "Fixar"}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Título da nota"
                  className="text-base font-bold bg-black/40 border-fuchsia-500/30 text-white placeholder:text-white/30 focus-visible:ring-fuchsia-400/60"
                />

                {/* Categorias (scroll horizontal no mobile) */}
                <div className="-mx-1 px-1 overflow-x-auto">
                  <div className="flex gap-1.5 w-max">
                    {(["idea", "project", "personal", "other"] as NoteCategory[]).map((c) => {
                      const m = CATEGORY_META[c];
                      const Icon = m.icon;
                      const active = draftCategory === c;
                      return (
                        <button
                          key={c}
                          onClick={() => setDraftCategory(c)}
                          className={cn(
                            "text-[11px] px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-all whitespace-nowrap shrink-0",
                            m.cls,
                            active ? `ring-2 ${m.ring} ring-offset-1 ring-offset-black` : "opacity-60 hover:opacity-100",
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Lembrete */}
                <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-3 py-2">
                  <Bell className="h-4 w-4 text-emerald-300 shrink-0" />
                  <label className="text-[11px] text-emerald-200/80 shrink-0">Lembrete:</label>
                  <input
                    type="datetime-local"
                    value={toLocalInput(draftReminder)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraftReminder(v ? new Date(v).toISOString() : null);
                    }}
                    className="flex-1 bg-transparent text-xs text-white outline-none [color-scheme:dark]"
                  />
                  {draftReminder && (
                    <button
                      onClick={() => setDraftReminder(null)}
                      className="text-emerald-300/70 hover:text-emerald-200"
                      aria-label="Remover lembrete"
                    >
                      <BellOff className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <Textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Cole um link de imagem, vídeo, áudio, perfil ou escreva sua nota... use @username para mencionar."
                  className="min-h-[180px] sm:min-h-[220px] resize-y bg-black/40 border-fuchsia-500/30 text-white placeholder:text-white/30 focus-visible:ring-fuchsia-400/60 text-sm"
                />

                {draftContent && (
                  <div className="border border-cyan-400/20 rounded-lg p-3 bg-cyan-500/5">
                    <p className="text-[10px] uppercase tracking-widest text-cyan-300/70 mb-2">
                      Pré-visualização
                    </p>
                    <SmartPreview text={draftContent} />
                  </div>
                )}

                <div className="sm:hidden flex items-center gap-1.5 text-xs text-cyan-200/80">
                  {savingStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {savingStatus === "saved" && <Check className="h-3 w-3 text-emerald-400" />}
                  <span>
                    {savingStatus === "saving" ? "Salvando..." : savingStatus === "saved" ? "Salvo" : "Auto-salvar ativo"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
