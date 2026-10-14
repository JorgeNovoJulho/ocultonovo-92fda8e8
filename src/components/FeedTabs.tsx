import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { SquarePen, BrainCircuit, Sparkles, LayoutGrid } from "lucide-react";
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
  "h-10 sm:h-11 px-2.5 sm:px-3 rounded-lg sm:rounded-xl " +
  "flex-1 sm:min-w-[6rem] " +
  "text-[10px] sm:text-[13px] font-extrabold uppercase tracking-[0.02em] leading-none whitespace-nowrap";

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
  // Os 3 botões têm exatamente o mesmo tamanho (grade de 3 colunas iguais).
  // Sem filtros/brilho animado/desfoque no celular: esses efeitos sobre uma
  // barra fixa forçam camadas de GPU grandes e causavam "chuvisco" em
  // aparelhos fracos (Realme C55 e abaixo).
  const shortLabel: Record<FeedTab, string> = {
    following: t('feed.tabs.following'),
    foryou: 'Novidades',
    vip: 'VIP',
    card: t('feed.tabs.card'),
  };
  const tabIcon: Record<FeedTab, typeof Sparkles> = {
    following: Sparkles,
    foryou: Sparkles,
    vip: Sparkles,
    card: LayoutGrid,
  };
  const tabTone: Record<FeedTab, { active: string; idle: string }> = {
    following: { active: 'bg-sky-600 border-sky-400 text-white', idle: 'border-sky-500/40 text-sky-200 bg-sky-500/10' },
    foryou: {
      active: 'bg-gradient-to-br from-violet-600 to-fuchsia-600 border-violet-300/80 text-white shadow-md shadow-violet-900/40',
      idle: 'border-violet-400/45 text-violet-200 bg-violet-500/10 hover:bg-violet-500/20',
    },
    vip: { active: 'bg-amber-500 border-amber-300 text-black', idle: 'border-amber-400/40 text-amber-200 bg-amber-500/10' },
    card: {
      active: 'bg-gradient-to-br from-emerald-600 to-teal-600 border-emerald-300/80 text-white shadow-md shadow-emerald-900/40',
      idle: 'border-emerald-400/45 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20',
    },
  };
  const BTN =
    "relative flex h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 " +
    "text-[11px] sm:text-[13px] font-extrabold uppercase tracking-wide leading-none whitespace-nowrap " +
    "select-none transition-colors active:scale-[0.97]";

  return (
    <div className="sticky top-14 md:top-16 z-50 bg-background border-b border-border/30 md:bg-background/95 md:backdrop-blur-md">
      <div className="grid grid-cols-3 gap-2 p-2 pt-3 md:flex md:gap-2">
        <button
          key="publish"
          type="button"
          onClick={handleCreatePost}
          className={cn(
            BTN,
            "border-sky-300/70 bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-md shadow-blue-900/40 hover:from-sky-400 hover:to-blue-600",
            "md:order-last md:w-auto md:min-w-[8rem]",
          )}
          title="Publicar no feed"
        >
          <SquarePen className="h-4 w-4 shrink-0" />
          <span className="truncate">Publicar</span>
        </button>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tabIcon[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-pressed={isActive}
              title={tab.label}
              className={cn(BTN, "md:flex-1", isActive ? tabTone[tab.id].active : tabTone[tab.id].idle)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate md:hidden">{shortLabel[tab.id]}</span>
              <span className="hidden truncate md:inline">{tab.label}</span>
              {isActive && <span className="absolute inset-x-3 bottom-1 h-[2px] rounded-full bg-white/80" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

