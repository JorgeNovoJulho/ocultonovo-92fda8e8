/**
 * StockImageLibrary — busca rápida no Unsplash Source (sem chave de API).
 *
 * Recursos:
 *  • Debounce 450ms na busca por texto
 *  • Persistência em localStorage (busca + tags + seed/página)
 *  • Botão "Limpar tudo" remove busca, filtros e estado salvo
 *  • Paginação por página (seed = page) com Prev/Next persistido
 *  • Chips de tags multi-select agrupados
 *  • Skeleton loaders, ícones de status (loading/erro/sucesso)
 *  • Erros padronizados com código e ações sugeridas
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Search,
  ImageIcon,
  Loader2,
  RotateCcw,
  X,
  CheckCircle2,
  Eraser,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { toStructuredError, type AdStructuredError, type AdErrorAction } from "@/lib/adErrors";
import { AdErrorAlert } from "./AdErrorAlert";

interface Props {
  onPick: (url: string) => void;
  defaultQuery?: string;
}

const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: "Vibe", tags: ["luxo", "noite", "minimal", "vintage", "neon"] },
  { label: "Cena", tags: ["festa", "casal", "viagem", "praia", "cidade"] },
  { label: "Cor", tags: ["preto", "dourado", "vermelho", "rosa", "azul"] },
];

const GRID_COUNT = 9;
const LS_KEY = "ad-stock-library:v2";

interface PersistedState {
  q: string;
  selectedTags: string[];
  page: number;
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PersistedState>;
      return {
        q: typeof p.q === "string" ? p.q : "",
        selectedTags: Array.isArray(p.selectedTags) ? p.selectedTags.filter((x) => typeof x === "string") : [],
        page: typeof p.page === "number" && p.page >= 0 ? p.page : 0,
      };
    }
  } catch {
    /* ignore */
  }
  return { q: "", selectedTags: [], page: 0 };
}

export function StockImageLibrary({ onPick, defaultQuery = "" }: Props) {
  const persisted = useMemo(loadPersisted, []);
  const [q, setQ] = useState(persisted.q || defaultQuery);
  const [selectedTags, setSelectedTags] = useState<string[]>(persisted.selectedTags);
  const [page, setPage] = useState(persisted.page);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [structuredError, setStructuredError] = useState<AdStructuredError | null>(null);

  const debouncedQ = useDebounce(q, 450);

  // Persiste sempre que mudar
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ q: debouncedQ, selectedTags, page } satisfies PersistedState),
      );
    } catch {
      /* ignore */
    }
  }, [debouncedQ, selectedTags, page]);

  const effectiveQuery = useMemo(() => {
    const base = debouncedQ.trim();
    const tags = selectedTags.join(",");
    const joined = [base, tags].filter(Boolean).join(",");
    return joined || "abstract";
  }, [debouncedQ, selectedTags]);

  // Reset página ao mudar busca/tags (mantém quando só o page muda)
  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, selectedTags.join("|")]);

  const items = useMemo(
    () =>
      Array.from({ length: GRID_COUNT }, (_, i) => {
        // Picsum Photos (sem API key, estável). Usamos seed determinístico
        // a partir da query + página + índice para que o usuário sempre veja
        // resultados consistentes ao revisitar a mesma busca.
        const seed = `${effectiveQuery}-${page}-${i}`.replace(/[^a-z0-9-]/gi, "_");
        return {
          id: `${page}-${i}`,
          thumb: `https://picsum.photos/seed/${encodeURIComponent(seed)}/300/200`,
          full: `https://picsum.photos/seed/${encodeURIComponent(seed)}/1600/900`,
        };
      }),
    [effectiveQuery, page],
  );


  // Reset estado ao mudar de busca/seed + failsafe de timeout
  useEffect(() => {
    setLoading(true);
    setLoadedCount(0);
    setErrorCount(0);
    setStructuredError(null);
    const failsafe = window.setTimeout(() => {
      // Só sinaliza timeout se nenhuma imagem chegou ainda.
      setLoadedCount((loaded) => {
        setErrorCount((errored) => {
          if (loaded === 0 && errored === 0) {
            setLoading(false);
            setStructuredError(
              toStructuredError("stock", new Error("Timeout esgotado ao carregar imagens")),
            );
          } else if (loaded + errored < GRID_COUNT) {
            // Algumas chegaram — encerra o spinner mas não bloqueia o grid.
            setLoading(false);
          }
          return errored;
        });
        return loaded;
      });
    }, 15000);
    return () => window.clearTimeout(failsafe);
  }, [items]);


  // Quando todos terminarem
  useEffect(() => {
    if (loadedCount + errorCount >= GRID_COUNT && loading) {
      setLoading(false);
      if (errorCount === GRID_COUNT) {
        setStructuredError(
          toStructuredError("stock", new Error("Nenhuma imagem retornou. Verifique sua conexão.")),
        );
      }
    }
  }, [loadedCount, errorCount, loading]);

  const reshuffle = useCallback(() => setPage((p) => p + 1), []);
  const prevPage = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const nextPage = useCallback(() => setPage((p) => p + 1), []);

  const toggleTag = (t: string) =>
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const resetAll = useCallback(() => {
    setQ("");
    setSelectedTags([]);
    setPage(0);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const handleErrorAction = (a: AdErrorAction) => {
    if (a === "retry") reshuffle();
    else if (a === "change_query") {
      setSelectedTags([]);
      setQ("");
    } else if (a === "cancel") setStructuredError(null);
    else if (a === "check_connection") {
      window.open("about:blank", "_self");
    }
  };

  const allDone = !loading && !structuredError && loadedCount > 0;
  const hasPersisted = !!(debouncedQ || selectedTags.length || page > 0);

  return (
    <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/20">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar imagens (ex: festa, casal, praia)…"
            className="pl-8 pr-7 h-9 text-xs"
            aria-label="Buscar imagens"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
              aria-label="Limpar busca"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={reshuffle}
          disabled={loading}
          className="h-9 gap-1.5"
          title="Buscar novas imagens"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : structuredError ? (
            <RotateCcw className="h-3.5 w-3.5 text-destructive" />
          ) : allDone ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Renovar</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={resetAll}
          disabled={!hasPersisted || loading}
          className="h-9 gap-1.5 text-muted-foreground"
          title="Limpar busca, filtros e paginação salvos"
        >
          <Eraser className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Limpar</span>
        </Button>
      </div>

      {/* Filtros por tags */}
      <div className="space-y-1.5">
        {TAG_GROUPS.map((g) => (
          <div key={g.label} className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-10 shrink-0">
              {g.label}
            </span>
            {g.tags.map((t) => {
              const active = selectedTags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:border-primary/60",
                  )}
                  aria-pressed={active}
                >
                  {t}
                </button>
              );
            })}
          </div>
        ))}
        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedTags([])}
            className="text-[10px] text-muted-foreground underline hover:text-foreground"
          >
            limpar filtros ({selectedTags.length})
          </button>
        )}
      </div>

      {/* Grid com skeleton */}
      <div className="relative grid grid-cols-3 gap-2 min-h-[140px]">
        {items.map((it, idx) => (
          <div key={it.id} className="relative aspect-[3/2]">
            {loading && loadedCount <= idx && (
              <Skeleton className="absolute inset-0 rounded-md" />
            )}
            <button
              type="button"
              onClick={() => onPick(it.full)}
              disabled={loading}
              className={cn(
                "group relative w-full h-full overflow-hidden rounded-md border border-border bg-muted",
                "hover:ring-2 hover:ring-primary/60 transition-all disabled:opacity-60",
              )}
              title="Usar esta imagem"
            >
              <img
                src={it.thumb}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                onLoad={() => setLoadedCount((n) => n + 1)}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = "hidden";
                  setErrorCount((n) => n + 1);
                }}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Paginação persistida */}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={prevPage}
          disabled={loading || page === 0}
          className="h-7 gap-1 text-[11px]"
        >
          <ChevronLeft className="h-3 w-3" /> Anterior
        </Button>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Página {page + 1}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={nextPage}
          disabled={loading}
          className="h-7 gap-1 text-[11px]"
        >
          Próxima <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      {/* Erro padronizado */}
      {structuredError && !loading && (
        <AdErrorAlert
          error={structuredError}
          onAction={handleErrorAction}
          onDismiss={() => setStructuredError(null)}
          compact
        />
      )}

      {!structuredError && errorCount > 0 && errorCount < GRID_COUNT && !loading && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          {errorCount} imagem(ns) não carregaram. Renove para tentar de novo.
        </p>
      )}

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <ImageIcon className="h-3 w-3" /> Cortesia de Picsum Photos · clique para aplicar
        </span>
        {loading ? (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> carregando…
          </span>
        ) : allDone ? (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> {loadedCount}/{GRID_COUNT} prontas
          </span>
        ) : null}
      </div>
    </div>
  );
}
