import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { SquarePen, BrainCircuit } from "lucide-react";
import { OcultoPlayFeedTabButton } from "@/components/OcultoPlayFeedTabButton";

/** Prefetch do chunk do CentralAuraModal — evita atraso ao clicar em Aura IA. */
function prefetchAuraModal() {
  try { void import("@/components/retention/CentralAuraModal"); } catch { /* noop */ }
}

/** Tag "NOVO" reutilizável posicionada no canto superior direito do botão. */
function NewTag({ tone = 'fuchsia' }: { tone?: 'fuchsia' | 'amber' }) {
  // Solid green badge with white text — sem transparência, máximo destaque.
  void tone;
  // 100% opaco — zero transparência para máximo destaque
  const colors = 'bg-[#16a34a] text-white ring-2 ring-white shadow-[0_0_12px_#22c55e]';
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-1.5 -right-1.5 z-[60]",
        "rounded-full px-1.5 py-[2px] text-[8px] font-black uppercase leading-none tracking-[0.08em]",
        "animate-pulse",
        colors,
      )}
    >
      NOVO
    </span>
  );
}
export { NewTag as FeedTabNewBadge };

export type FeedTab = 'following' | 'foryou' | 'vip' | 'card';

interface FeedTabsProps {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
  /** @deprecated */
  onCreatePost?: () => void;
  /** @deprecated */
  onScrollTop?: () => void;
}

/** Gradientes únicos por aba — texto ativo, underline, glow e preenchimento semi-transparente. */
const TAB_THEME: Record<FeedTab, {
  text: string;
  underline: string;
  glow: string;
  idleHover: string;
  fillActive: string;
  fillIdle: string;
  ring: string;
}> = {
  following: {
    text: 'from-sky-400 via-cyan-400 to-blue-500',
    underline: 'from-sky-400 via-cyan-400 to-blue-500',
    glow: 'drop-shadow-[0_0_6px_rgba(56,189,248,0.55)]',
    idleHover: 'hover:text-sky-300 hover:bg-sky-400/10',
    fillActive: 'bg-gradient-to-r from-sky-400/25 via-cyan-400/20 to-blue-500/25',
    fillIdle: 'bg-sky-400/5',
    ring: 'border-sky-400/45 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]',
  },
  foryou: {
    text: 'from-violet-300 via-purple-300 to-fuchsia-300',
    underline: 'from-violet-500 via-purple-500 to-fuchsia-500',
    glow: 'drop-shadow-[0_0_8px_rgba(168,85,247,0.85)]',
    idleHover: 'hover:text-violet-200 hover:bg-violet-500/10',
    fillActive: 'bg-gradient-to-r from-violet-600/45 via-purple-600/40 to-fuchsia-600/45',
    fillIdle: 'bg-violet-500/10',
    ring: 'border-violet-400/70 shadow-[0_0_0_1px_rgba(168,85,247,0.45),0_0_18px_rgba(168,85,247,0.45)]',
  },
  vip: {
    text: 'from-yellow-300 via-amber-400 to-orange-500',
    underline: 'from-yellow-300 via-amber-400 to-orange-500',
    glow: 'drop-shadow-[0_0_6px_rgba(251,191,36,0.65)]',
    idleHover: 'hover:text-amber-300 hover:bg-amber-400/10',
    fillActive: 'bg-gradient-to-r from-yellow-300/25 via-amber-400/25 to-orange-500/25',
    fillIdle: 'bg-amber-400/5',
    ring: 'border-amber-400/50 shadow-[0_0_0_1px_rgba(251,191,36,0.22)]',
  },
  card: {
    text: 'from-emerald-200 via-green-200 to-teal-200',
    underline: 'from-emerald-500 via-green-500 to-teal-500',
    glow: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.85)]',
    idleHover: 'hover:text-emerald-200 hover:bg-emerald-500/15',
    fillActive: 'bg-gradient-to-r from-emerald-600/55 via-green-600/50 to-teal-600/55',
    fillIdle: 'bg-emerald-500/15',
    ring: 'border-emerald-300/70 shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_0_18px_rgba(16,185,129,0.5)]',
  },
};

/** Classes base padronizadas para TODOS os botões da barra (mesmo tamanho, padding, radius e tipografia). */
export const FEED_BTN_BASE =
  "relative flex items-center justify-center text-center select-none transition-all " +
  "h-9 md:h-11 px-2.5 md:px-3 rounded-lg md:rounded-xl " +
  "md:flex-1 md:min-w-[6rem] " +
  "text-[11px] md:text-[13px] font-extrabold uppercase tracking-[0.02em] leading-none whitespace-nowrap";

export function FeedTabs({ activeTab, onTabChange, onCreatePost }: FeedTabsProps) {
  const { t } = useI18n();
  const handleCreatePost = () => {
    if (onCreatePost) {
      onCreatePost();
      return;
    }
    window.dispatchEvent(new CustomEvent('oculto:open-create-post'));
  };
  const tabs: { id: FeedTab; label: string }[] = [
    { id: 'foryou', label: t('feed.tabs.foryou') },
    { id: 'card', label: t('feed.tabs.card') },
  ];
  const openAuraIa = () => {
    prefetchAuraModal();
    try { window.dispatchEvent(new CustomEvent('oculto:open-aura')); } catch {}
  };

  // Prefetch idle do chunk do Aura IA para abrir instantaneamente em mobile.
  useEffect(() => {
    const ric: any = (window as any).requestIdleCallback;
    if (typeof ric === 'function') {
      const id = ric(prefetchAuraModal, { timeout: 2500 });
      return () => { try { (window as any).cancelIdleCallback?.(id); } catch { /* noop */ } };
    }
    const t = window.setTimeout(prefetchAuraModal, 1500);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="sticky top-14 md:top-16 z-50 bg-background/95 backdrop-blur-md border-b border-border/30 overflow-visible">
      <div
        className="
          flex flex-col gap-1.5 p-2 pt-3
          md:flex-row md:items-stretch md:gap-2 md:overflow-x-auto
          overflow-visible w-full
          [scrollbar-width:none] [-ms-overflow-style:none]
          [&::-webkit-scrollbar]:hidden
        "
      >
        <button
          key="publish"
          onClick={handleCreatePost}
          className={cn(
            FEED_BTN_BASE,
            "border-2 w-full md:w-auto md:order-last",
            "border-publish-border bg-gradient-to-r from-publish/80 via-publish/55 to-publish/35",
            "text-publish-foreground hover:from-publish hover:via-publish/75 hover:to-publish/50",
            "shadow-[0_0_0_1px_hsl(var(--publish-border)/0.45),0_0_18px_hsl(var(--publish-glow)/0.34)]",
            "hover:shadow-[0_0_0_1px_hsl(var(--publish-border)/0.65),0_0_28px_hsl(var(--publish-glow)/0.48)]",
            "gap-1.5 animate-glow-pulse-blue",
          )}
          title="Publicar no feed"
        >
          <SquarePen className="h-4 w-4 shrink-0" />
          <span className="truncate">Publicar</span>
        </button>
        <div className="grid grid-cols-2 gap-1.5 md:contents w-full">
          {tabs.map((tab) => {
            const theme = TAB_THEME[tab.id];
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  FEED_BTN_BASE,
                  "border-2 w-full",
                  theme.fillActive,
                  theme.ring,
                  "bg-clip-text text-transparent bg-gradient-to-r",
                  theme.text,
                  theme.glow,
                  isActive ? "brightness-125 scale-[1.02]" : "brightness-95 hover:brightness-110",
                )}
              >
                <span className="truncate">{tab.label}</span>
                {isActive && (
                  <div
                    className={cn(
                      "absolute bottom-0 left-2 right-2 h-[3px] rounded-full bg-gradient-to-r",
                      theme.underline,
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

