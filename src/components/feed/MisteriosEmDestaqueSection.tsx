import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCw, CheckCircle2, Database, Loader2, MoreVertical, Eye, EyeOff, Megaphone } from "lucide-react";
import {
  useMisteriosDestaque,
  type MisteriosWindow,
  type MisterioPost,
} from "@/hooks/useMisteriosDestaque";
import { PinterestMasonry } from "@/components/common/PinterestMasonry";
import { PostMysteryViewer } from "@/components/feed/PostMysteryViewer";
import { SafePostBlurOverlay } from "@/components/feed/SafePostBlurOverlay";
import { useSafeBlur } from "@/safe-blur/SafeBlurProvider";
import { useFeedExperienceMode } from "@/hooks/useFeedExperienceMode";
import { MisteriosBulkAdminCommentModal } from "@/components/feed/MisteriosBulkAdminCommentModal";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const SECTION_REVEAL_KEY = "oculto:misterios-destaque:revealed";

const WINDOW_OPTIONS: Array<{ key: MisteriosWindow; label: string }> = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "1y", label: "1 ano" },
  { key: "all", label: "Todos" },
];

type Status = "cache" | "revalidating" | "loading" | "updated";

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; icon: any; cls: string }> = {
    loading: {
      label: "Carregando…",
      icon: Loader2,
      cls: "text-muted-foreground border-border/60 [&_svg]:animate-spin",
    },
    cache: {
      label: "Carregando do cache",
      icon: Database,
      cls: "text-amber-500 border-amber-500/40 bg-amber-500/5",
    },
    revalidating: {
      label: "Revalidando",
      icon: RefreshCw,
      cls: "text-primary border-primary/40 bg-primary/5 [&_svg]:animate-spin",
    },
    updated: {
      label: "Atualizado",
      icon: CheckCircle2,
      cls: "text-emerald-500 border-emerald-500/40 bg-emerald-500/5",
    },
  };
  const { label, icon: Icon, cls } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        cls,
      )}
      aria-live="polite"
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

const PAGE_SIZE = 20;
const MAX_ITEMS = 100; // até 5 páginas
const UI_STATE_KEY = "oculto:misterios-destaque:ui";

function persistUiState(next: { windowKey: MisteriosWindow; page: number }) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
  } catch {
    // noop
  }
}

function readUiState(): { windowKey: MisteriosWindow; page: number } {
  if (typeof window === "undefined") {
    return { windowKey: "7d", page: 1 };
  }

  try {
    const raw = window.sessionStorage.getItem(UI_STATE_KEY);
    if (!raw) return { windowKey: "7d", page: 1 };

    const parsed = JSON.parse(raw) as { windowKey?: MisteriosWindow; page?: number };
    const safeWindowKey = WINDOW_OPTIONS.some((option) => option.key === parsed.windowKey)
      ? parsed.windowKey!
      : "7d";
    const safePage = Math.max(1, Number(parsed.page) || 1);

    return { windowKey: safeWindowKey, page: safePage };
  } catch {
    return { windowKey: "7d", page: 1 };
  }
}

export function MisteriosEmDestaqueSection() {
  const initialUiState = useMemo(() => readUiState(), []);
  const [windowKey, setWindowKey] = useState<MisteriosWindow>(initialUiState.windowKey);
  const [page, setPage] = useState(initialUiState.page);
  const [selected, setSelected] = useState<MisterioPost | null>(null);
  const { safeBlurOn } = useSafeBlur();
  const { isAdultOnly } = useFeedExperienceMode();
  const { data: isMasterAdmin = false } = useIsMasterAdmin();
  const [sectionRevealed, setSectionRevealed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.sessionStorage.getItem(SECTION_REVEAL_KEY) === "1"; } catch { return false; }
  });
  // Reveal persiste durante toda a sessão (mesmo que o usuário religue o modo seguro).
  const showSectionBlur = !isAdultOnly && safeBlurOn && !sectionRevealed;
  const revealSection = () => {
    setSectionRevealed(true);
    try { window.sessionStorage.setItem(SECTION_REVEAL_KEY, "1"); } catch {}
  };
  const {
    data: posts,
    isLoading,
    isFetching,
    isPlaceholderData,
    refetch,
    dataUpdatedAt,
  } = useMisteriosDestaque(MAX_ITEMS, windowKey);

  // "Atualizado" só fica visível por alguns segundos depois do fetch terminar.
  const [showUpdated, setShowUpdated] = useState(false);
  useEffect(() => {
    if (!isFetching && dataUpdatedAt) {
      setShowUpdated(true);
      const t = window.setTimeout(() => setShowUpdated(false), 2500);
      return () => window.clearTimeout(t);
    }
  }, [isFetching, dataUpdatedAt]);

  // Resetar página ao trocar de filtro
  useEffect(() => { setPage(1); }, [windowKey]);

  useEffect(() => {
    persistUiState({ windowKey, page });
  }, [windowKey, page]);

  const allItems = (Array.isArray(posts) ? posts : []).filter((post: any) =>
    isAdultOnly ? post?.is_adult === true : true,
  );
  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const items = allItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const hasCacheOnly = isPlaceholderData && isFetching;
  const status: Status = hasCacheOnly
    ? "cache"
    : isLoading
      ? "loading"
      : isFetching
        ? "revalidating"
        : showUpdated
          ? "updated"
          : "updated";

  // Mostra o skeleton quando NÃO há nada (nem cache nem dados) e está buscando.
  const showSkeleton = isLoading && allItems.length === 0;
  // Fallback amigável: ainda não carregou, sem cache, mas a query já está pronta.
  const showEmptyFallback = !isLoading && !isFetching && allItems.length === 0;

  const handleWindowChange = (nextWindow: MisteriosWindow) => {
    persistUiState({ windowKey: nextWindow, page: 1 });
    setWindowKey(nextWindow);
  };

  const handlePageChange = (nextPage: number | ((current: number) => number)) => {
    setPage((current) => {
      const resolved = typeof nextPage === "function" ? nextPage(current) : nextPage;
      const safePage = Math.max(1, resolved);
      persistUiState({ windowKey, page: safePage });
      return safePage;
    });
  };

  // ============ Ações Master em LOTE ============
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [bulkBlurBusy, setBulkBlurBusy] = useState(false);
  const [showBulkComment, setShowBulkComment] = useState(false);

  // Há ao menos 1 mistério visível atualmente com blur "none" (sem blur)?
  const someNoBlur = useMemo(
    () => allItems.some((p: any) => (p?.preview_blur) === "none"),
    [allItems],
  );

  const applyBulkBlur = useCallback(async (mode: "on" | "off") => {
    const ids = allItems.map((p) => p.id).filter(Boolean) as string[];
    if (!ids.length) {
      toast({ title: "Nada para alterar", description: "Nenhum mistério visível na seção.", variant: "destructive" });
      return;
    }
    const next = mode === "off" ? "none" : "medium";
    try {
      setBulkBlurBusy(true);

      // Otimista nos caches conhecidos
      const setBlurInCache = (queryKey: string[]) => {
        qc.setQueriesData({ queryKey }, (old: any) => {
          if (!old) return old;
          const idSet = new Set(ids);
          const patch = (p: any) => p && idSet.has(p.id) ? { ...p, preview_blur: next } : p;
          if (Array.isArray(old)) return old.map(patch);
          if (old?.pages) return { ...old, pages: old.pages.map((pg: any) => Array.isArray(pg) ? pg.map(patch) : { ...pg, items: pg?.items?.map(patch) }) };
          return patch(old);
        });
      };
      ["posts", "posts-infinite", "misterios-destaque", "creator-posts", "profile-posts", "my-posts"].forEach((qk) => setBlurInCache([qk]));

      const { error } = await (supabase as any)
        .from("posts")
        .update({ preview_blur: next })
        .in("id", ids);
      if (error) throw error;

      toast({
        title: next === "none" ? "✨ Blur desativado em lote" : "Blur padrão reativado em lote",
        description: `${ids.length} mistério(s) atualizados.`,
      });
      ["posts", "posts-infinite", "misterios-destaque"].forEach((qk) =>
        qc.invalidateQueries({ queryKey: [qk] }),
      );
    } catch (e: any) {
      toast({ title: "Erro ao aplicar em lote", description: e?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setBulkBlurBusy(false);
    }
  }, [allItems, qc, toast]);


  return (
    <section
      aria-label="Mistérios em Destaque"
      className="mx-2 sm:mx-4 my-3 rounded-xl border border-dashed border-border/60 bg-card/40 p-2 sm:p-4 w-auto max-w-full overflow-hidden"
    >
      <header className="flex flex-wrap items-center gap-2 mb-3">

        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base sm:text-lg font-bold text-primary">
            Mistérios em Destaque
          </h2>
          <StatusBadge status={status} />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <div role="tablist" aria-label="Filtrar período" className="flex flex-wrap items-center gap-1">
            {WINDOW_OPTIONS.map((opt) => {
              const active = windowKey === opt.key;
              return (
                <button
                  key={opt.key}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => handleWindowChange(opt.key)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border/60 hover:text-foreground hover:border-primary/50",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className={cn(
              "ml-1 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5",
              "px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors",
              "hover:bg-primary/10 disabled:opacity-60 disabled:cursor-not-allowed",
            )}
            aria-label="Atualizar agora"
            title="Atualizar agora"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
            Atualizar agora
          </button>

          {isMasterAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Ações Master da seção"
                title="Ações Master (afetam todos os mistérios visíveis)"
                className={cn(
                  "ml-1 inline-flex items-center justify-center h-7 w-7 rounded-full",
                  "bg-amber-500/15 hover:bg-amber-500/25 backdrop-blur-sm",
                  "text-amber-300 border border-amber-400/50 shadow-md transition-colors",
                )}
              >
                {bulkBlurBusy
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <MoreVertical className="h-3.5 w-3.5" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs text-amber-400">
                  Ações Master — Mistérios em Destaque
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); applyBulkBlur(someNoBlur ? "on" : "off"); }}
                  disabled={bulkBlurBusy || allItems.length === 0}
                  className="gap-2 text-emerald-400 focus:text-emerald-300 text-xs"
                >
                  {someNoBlur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span className="flex-1">
                    {someNoBlur
                      ? `Ativar blur padrão em ${allItems.length} mistério(s)`
                      : `Desativar blur padrão em ${allItems.length} mistério(s)`}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); setShowBulkComment(true); }}
                  disabled={allItems.length === 0}
                  className="gap-2 text-amber-400 focus:text-amber-300 text-xs"
                >
                  <Megaphone className="h-4 w-4" />
                  <span className="flex-1">
                    Adicionar comentário Master em {allItems.length} mistério(s)
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {user?.id && (
        <MisteriosBulkAdminCommentModal
          open={showBulkComment}
          onOpenChange={setShowBulkComment}
          postIds={allItems.map((p) => p.id)}
          authorId={user.id}
        />
      )}

      <div className="relative">
        <div
          className={cn(
            "transition-[filter,opacity] duration-300 ease-out",
            showSectionBlur && "pointer-events-none select-none opacity-95",
          )}
          style={showSectionBlur ? { filter: "blur(2px)" } : undefined}
          aria-hidden={showSectionBlur}
        >
          {showSkeleton ? (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Buscando os mistérios mais quentes da comunidade…
              </p>
              <div className="columns-2 sm:columns-3 lg:columns-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="mb-2 break-inside-avoid rounded-lg bg-muted/40 animate-pulse"
                    style={{ height: 120 + ((i * 37) % 180) }}
                  />
                ))}
              </div>
            </div>
          ) : showEmptyFallback ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {windowKey === "all"
                ? "Ainda não há mistérios em destaque. Publique e interaja para aparecer aqui."
                : "Sem destaques neste período. Tente ampliar o filtro."}
            </div>
          ) : (
            <>
              <PinterestMasonry
                items={items}
                isLoading={false}
                onItemClick={(item) => !showSectionBlur && setSelected(item as MisterioPost)}
                emptyHint={
                  windowKey === "all"
                    ? "Ainda não há mistérios em destaque. Publique e interaja para aparecer aqui."
                    : "Sem destaques neste período. Tente ampliar o filtro."
                }
                renderOverlay={undefined}
              />

              {totalPages > 1 && (
                <nav
                  aria-label="Paginação Mistérios em Destaque"
                  className="mt-3 flex flex-wrap items-center justify-center gap-1.5"
                >
                  <button
                    type="button"
                    onClick={() => handlePageChange((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ‹ Anterior
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const n = i + 1;
                    const active = n === currentPage;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handlePageChange(n)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "min-w-[28px] px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-muted-foreground border-border/60 hover:text-foreground hover:border-primary/50",
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handlePageChange((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Próxima ›
                  </button>
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    Página {currentPage} de {totalPages} · {allItems.length} mistérios
                  </span>
                </nav>
              )}
            </>
          )}
        </div>
        {showSectionBlur && (
          <div className="absolute inset-0 z-20 animate-fade-in">
            <SafePostBlurOverlay onReveal={revealSection} />
          </div>
        )}
      </div>



      <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
        Os conteúdos com mais curtidas, comentários e salvos do período selecionado.
      </p>

      <PostMysteryViewer post={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
