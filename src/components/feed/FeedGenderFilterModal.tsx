/**
 * Modal de Filtro Global de Gênero do Feed.
 * Aparece no primeiro login (novos usuários) e uma única vez para usuários
 * antigos no próximo login. Pode ser reaberto em Configurações → Experiência.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, Settings as SettingsIcon, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FEED_GENDER_CATEGORIES,
  FEED_GENDER_CATEGORY_DEFS,
  type FeedGenderCategory,
} from "@/config/feedGenderFilter";
import { useFeedGenderFilter } from "@/hooks/useFeedGenderFilter";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Quando true, mostra subtítulo de boas-vindas (primeiro acesso). */
  firstRun?: boolean;
}

export function FeedGenderFilterModal({ open, onOpenChange, firstRun = false }: Props) {
  const { categories, save, dismissPrompt } = useFeedGenderFilter();
  const [selected, setSelected] = useState<FeedGenderCategory[]>([]);
  const [saving, setSaving] = useState(false);

  // Hidrata seleção atual ao abrir.
  useEffect(() => {
    if (open) {
      setSelected(categories.length ? categories : []);
    }
  }, [open, categories]);

  const toggle = (key: FeedGenderCategory) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleSelectAll = () => setSelected([...FEED_GENDER_CATEGORIES]);

  const canSave = selected.length > 0;

  const subtitle = useMemo(() => {
    if (firstRun) {
      return "Para começar, escolha quem você quer ver no seu feed. Você pode mudar a qualquer momento em Configurações → Experiência.";
    }
    return "Personalize seu feed: escolha quais perfis devem aparecer para você. Você pode alterar a qualquer momento em Configurações → Experiência.";
  }, [firstRun]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await save(selected);
      toast.success("Filtro do feed atualizado", {
        description:
          selected.length === FEED_GENDER_CATEGORIES.length
            ? "Você verá todos os tipos de perfis."
            : `Mostrando apenas: ${selected
                .map((k) => FEED_GENDER_CATEGORY_DEFS.find((d) => d.key === k)?.shortLabel ?? k)
                .join(", ")}.`,
        duration: 2800,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar sua escolha");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async (next: boolean) => {
    if (!next && firstRun) {
      // Fechar sem escolher num cenário "firstRun" → marca como visto para não loop infinito.
      try { await dismissPrompt(); } catch {}
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg w-[calc(100vw-1rem)] sm:w-full p-0 overflow-hidden bg-card border-border/60 flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] sm:max-h-[88dvh] gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => firstRun && e.preventDefault()}
      >
        {/* Cabeçalho */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-border/40 bg-gradient-to-b from-primary/10 to-transparent shrink-0">
          <div className="flex items-center gap-2 mb-1 pr-8">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <h2 className="text-base sm:text-lg font-bold leading-tight">
              {firstRun ? "Personalize seu feed" : "Filtro do feed"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-snug">{subtitle}</p>
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
            <SettingsIcon className="h-3 w-3" />
            Você pode alterar depois em Configurações.
          </p>
        </div>

        {/* Lista de categorias — área scrollável (scrollbar invisível) */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {FEED_GENDER_CATEGORY_DEFS.map((def) => {
            const Icon = def.icon;
            const active = selected.includes(def.key);
            return (
              <button
                key={def.key}
                type="button"
                onClick={() => toggle(def.key)}
                aria-pressed={active}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors touch-manipulation",
                  active
                    ? "border-primary/60 bg-primary/[0.08]"
                    : "border-border/50 hover:border-border bg-muted/20 hover:bg-muted/30",
                )}
              >
                <div
                  className={cn(
                    "h-10 w-10 rounded-md flex items-center justify-center shrink-0",
                    active ? "bg-primary/20" : "bg-muted/40",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-primary" : def.accent)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{def.label}</span>
                    {active && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold px-1.5 py-0.5">
                        <Check className="h-2.5 w-2.5" /> ATIVO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{def.description}</p>
                </div>
                <Switch
                  checked={active}
                  onCheckedChange={() => toggle(def.key)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Alternar ${def.label}`}
                />
              </button>
            );
          })}
          {!canSave && (
            <p className="pt-1 text-[11px] text-muted-foreground/80">
              Selecione ao menos uma categoria para continuar.
            </p>
          )}
        </div>

        {/* Ações — rodapé fixo sempre visível */}
        <div className="px-4 sm:px-5 py-3 border-t border-border/40 bg-card flex flex-col-reverse sm:flex-row gap-2 sm:items-center shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="sm:flex-1 h-10"
            onClick={handleSelectAll}
            disabled={saving}
          >
            Selecionar tudo
          </Button>
          <Button
            size="sm"
            className="sm:flex-1 h-10 font-semibold"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando…
              </>
            ) : (
              <>Aplicar ao feed</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
