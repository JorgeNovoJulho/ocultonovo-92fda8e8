/**
 * Atalhos dinâmicos baseados nas Seções Ocultas ativadas pelo usuário.
 *
 * - Reage em tempo real às mudanças feitas em /sessoes-ocultas
 *   (via useViewModePreferences → React Query + Realtime + BroadcastChannel).
 * - Quando o usuário clica em "Abrir seção" no card, o atalho aparece aqui
 *   instantaneamente; ao "Fechar seção", some.
 * - Não duplica entradas que já existem fixas no sidebar (ver SECTION_NAV_HIDE_IN_SIDEBAR).
 */
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { HOME_SECTIONS, type HomeSectionKey } from "@/config/homeSections";
import { SECTION_NAV, SECTION_NAV_HIDE_IN_SIDEBAR } from "@/config/sectionNav";
import { useViewModePreferences } from "@/hooks/useViewModePreferences";
import { useExperienceSettings } from "@/hooks/useExperienceSettings";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";

interface Props {
  variant?: "sidebar" | "drawer";
  onNavigate?: () => void;
}

export function SectionShortcutsNav({ variant = "sidebar", onNavigate }: Props) {
  const { pathname } = useLocation();
  const { isSectionEnabled, viewMode } = useViewModePreferences();
  const { data: settings } = useExperienceSettings();
  const { data: isMaster = false } = useIsMasterAdmin();

  const items = useMemo(() => {
    return HOME_SECTIONS.filter((s) => {
      if (s.key === "modo_card") return false;
      if (SECTION_NAV_HIDE_IN_SIDEBAR.has(s.key)) return false;
      if (!SECTION_NAV[s.key]) return false;
      // Caixa Oculta (campanhas) é uma ferramenta administrativa — só o
      // Admin Master vê o atalho no menu lateral.
      if (s.key === "caixa_oculta" && !isMaster) return false;
      // Respeita override do admin: só sections marcadas como elegíveis em
      // sessões ocultas viram atalho.
      const override = settings?.sections_config?.[s.key];
      const allowed =
        override && typeof override.in_hidden_sessions === "boolean"
          ? override.in_hidden_sessions
          : s.hiddenSessions;
      if (!allowed) return false;
      return isSectionEnabled(s.key);
    });
  }, [isSectionEnabled, settings, viewMode, isMaster]);

  if (pathname.startsWith("/admin")) return null;
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      {items.map((s) => {
        const nav = SECTION_NAV[s.key as HomeSectionKey]!;
        const Icon = nav.icon;
        const active = pathname === nav.route;
        return (
          <Link
            key={s.key}
            to={nav.route}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full",
              active
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
            aria-label={s.label}
            title={s.description}
          >
            <Icon className={cn("h-5 w-5 shrink-0", active ? "text-primary" : nav.iconClass)} />
            <span className="flex-1 text-left truncate">{s.label}</span>
            <span
              className="ml-auto h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0"
              aria-hidden
            />
          </Link>
        );
      })}
    </div>
  );
}
