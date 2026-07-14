import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Sparkles, BookOpen, Heart, Compass, Share2, Crown, DoorOpen,
  Calendar, Search, Gavel, MessageCircle, Gift, Radio, Activity,
  Lightbulb, Megaphone, Users, UserPlus, Info, Check, ExternalLink, Loader2,
  EyeOff, Lock, Radio as RadioIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HOME_SECTIONS, type HomeSectionKey } from "@/config/homeSections";
import { SectionInfoDialog } from "@/components/view-mode/SectionInfoDialog";
import { useExperienceSettings } from "@/hooks/useExperienceSettings";
import { useFeedMode } from "@/feed-modes/FeedModeProvider";
import { FEED_MODES, type FeedWidgetKey } from "@/feed-modes/modes.config";
import { SECTION_TO_WIDGET } from "@/feed-modes/hiddenSectionMap";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ICONS: Record<HomeSectionKey, React.ComponentType<{ className?: string }>> = {
  smart_start: Sparkles,
  stories: BookOpen,
  active_matches: Heart,
  discover_universe: Compass,
  referral_link: Share2,
  vip_creators: Crown,
  hidden_rooms: DoorOpen,
  events: Calendar,
  mysterious_discovery: Search,
  communities_feed_card: Users,
  auctions: Gavel,
  right_chat: MessageCircle,
  caixa_oculta: Gift,
  feed_vivo: Radio,
  presence_pulse: Activity,
  micro_tips: Lightbulb,
  sponsored_ads: Megaphone,
  recent_matches: Users,
  new_members: UserPlus,
  communities_trending: Users,
  modo_card: Compass,
};

/** Rota de "Ver no feed" por seção (para o ícone secundário). */
const SECTION_ROUTES: Partial<Record<HomeSectionKey, string>> = {
  smart_start: "/feed",
  stories: "/feed",
  active_matches: "/matches",
  discover_universe: "/feed",
  referral_link: "/indicacoes",
  vip_creators: "/vitrine-vip",
  hidden_rooms: "/experiencias-ocultas",
  events: "/events",
  mysterious_discovery: "/pesquisar",
  communities_feed_card: "/comunidades",
  auctions: "/auctions",
  right_chat: "/messages",
  caixa_oculta: "/caixa-oculta/criador",
  feed_vivo: "/feed",
  presence_pulse: "/feed",
  micro_tips: "/feed",
  sponsored_ads: "/feed",
  recent_matches: "/matches",
  new_members: "/pesquisar",
};

export default function SessoesOcultasPage() {
  const [infoKey, setInfoKey] = useState<HomeSectionKey | null>(null);
  const [pendingKey, setPendingKey] = useState<HomeSectionKey | null>(null);
  const { data: settings } = useExperienceSettings();
  const { mode, setMode, shows, customWidgets, setCustomWidgetsBulk } = useFeedMode();

  // Filtra seções respeitando override do admin (in_hidden_sessions) e
  // limita ao que está realmente mapeado para widgets do feed.
  const list = useMemo(() => {
    return HOME_SECTIONS.filter((s) => {
      if (s.key === "modo_card") return false;
      if (!SECTION_TO_WIDGET[s.key]) return false;
      const override = settings?.sections_config?.[s.key];
      if (override && typeof override.in_hidden_sessions === "boolean") {
        return override.in_hidden_sessions;
      }
      return s.hiddenSessions;
    });
  }, [settings]);

  const infoSection = infoKey ? HOME_SECTIONS.find((s) => s.key === infoKey) ?? null : null;

  // Se admin desligou Sessões Ocultas, redireciona para o feed.
  if (settings && settings.hidden_sessions_enabled === false) {
    return <Navigate to="/feed" replace />;
  }

  const title = settings?.hidden_sessions_title?.trim() || "Sessões Ocultas";
  const description =
    settings?.hidden_sessions_description?.trim() ||
    "Ative ou feche cada seção e veja o efeito imediato no seu feed. As preferências são salvas e sincronizam entre dispositivos.";

  /** Helper: monta seed completo de overrides preservando o estado atual
   *  do modo vigente (Completo/Social/etc) ao migrar para Personalizado. */
  const buildSeedFromCurrentMode = (): Partial<Record<FeedWidgetKey, boolean>> => {
    const baseSet =
      mode === "personalizado" ? FEED_MODES.limpo : FEED_MODES[mode] ?? FEED_MODES.limpo;
    const allKeys = Array.from(FEED_MODES.completo) as FeedWidgetKey[];
    const seed: Partial<Record<FeedWidgetKey, boolean>> = {};
    for (const k of allKeys) {
      const override = customWidgets[k];
      seed[k] = override !== undefined ? !!override : baseSet.has(k);
    }
    return seed;
  };

  const handleToggle = async (
    key: HomeSectionKey,
    label: string,
    nextEnabled: boolean,
  ) => {
    const widgetKey = SECTION_TO_WIDGET[key];
    if (!widgetKey) return;
    setPendingKey(key);
    try {
      const seed = buildSeedFromCurrentMode();
      seed[widgetKey] = nextEnabled;
      if (mode !== "personalizado") {
        await setMode("personalizado", "system");
      }
      await setCustomWidgetsBulk(seed);
      toast.success(
        nextEnabled
          ? `"${label}" foi ativada no feed`
          : `"${label}" foi fechada no feed`,
        { duration: 2200 },
      );
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível atualizar a preferência");
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="min-h-dvh p-3 sm:p-4 md:p-6 max-w-4xl mx-auto pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]">
      <header className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-3 mb-2">
          <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400 shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold leading-tight">{title}</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-snug">{description}</p>
        {mode !== 'personalizado' && (
          <p className="mt-2 text-[11px] text-muted-foreground/80 leading-snug">
            Dica: ao ativar/fechar uma seção, sua experiência passa para o modo Personalizado automaticamente e o feed atualiza na hora.
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {list.map((s) => {
          const Icon = ICONS[s.key] ?? Sparkles;
          const route = SECTION_ROUTES[s.key] ?? "/feed";
          const widgetKey = SECTION_TO_WIDGET[s.key]!;
          const enabled = shows(widgetKey);
          const isPending = pendingKey === s.key;

          // Estado visual em 2 níveis (sincronizado em tempo real com o feed
          // via React Query + Realtime + BroadcastChannel):
          // - ATIVA NO FEED (verde, ping animado)
          // - FECHADA NO FEED (cinza)
          const statusLabel = enabled ? "Ativa no feed" : "Fechada no feed";
          const StatusIcon = enabled ? RadioIcon : EyeOff;

          return (
            <div
              key={s.key}
              className={cn(
                "rounded-lg border bg-card/40 p-3 sm:p-4 flex flex-col gap-3 transition-colors relative",
                enabled
                  ? "border-emerald-500/50 bg-emerald-500/[0.04]"
                  : "border-border/40",
              )}
              aria-live="polite"
            >
              {/* Tag de status — sempre visível, no canto superior direito */}
              <span
                className={cn(
                  "absolute top-2 right-2 inline-flex items-center gap-1 rounded-full text-[10px] font-bold px-2 py-0.5 select-none",
                  enabled
                    ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                    : "bg-muted/60 text-muted-foreground",
                )}
                aria-label={`Status: ${statusLabel}`}
              >
                {enabled && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                )}
                <StatusIcon className="h-2.5 w-2.5" />
                {statusLabel.toUpperCase()}
              </span>

              <div className="flex items-start gap-3 pr-24">
                <div
                  className={cn(
                    "h-10 w-10 rounded-md flex items-center justify-center shrink-0 transition-colors",
                    enabled ? "bg-emerald-500/15" : "bg-primary/10",
                  )}
                >
                  <Icon className={cn("h-5 w-5", enabled ? "text-emerald-400" : "text-primary/80")} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-sm leading-tight">{s.label}</h2>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.description}</p>
                </div>
              </div>

              <Button
                size="sm"
                variant={enabled ? "outline" : "default"}
                className="w-full h-10 text-sm touch-manipulation"
                disabled={isPending}
                onClick={() => handleToggle(s.key, s.label, !enabled)}
                aria-pressed={enabled}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Sincronizando…
                  </>
                ) : enabled ? (
                  <>Fechar no feed</>
                ) : (
                  <>Abrir no feed</>
                )}
              </Button>
              <div className="flex gap-2">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-9 text-xs touch-manipulation"
                  aria-label={`Ver ${s.label} no feed`}
                >
                  <Link to={route}>
                    <ExternalLink className="h-4 w-4 mr-1" /> Ver no feed
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs touch-manipulation"
                  onClick={() => setInfoKey(s.key)}
                  aria-label={`Saiba mais sobre ${s.label}`}
                >
                  <Info className="h-4 w-4 mr-1" /> Info
                </Button>
              </div>
            </div>
          );
        })}
      </div>


      <SectionInfoDialog
        section={infoSection}
        open={!!infoSection}
        onOpenChange={(o) => !o && setInfoKey(null)}
      />
    </div>
  );
}
