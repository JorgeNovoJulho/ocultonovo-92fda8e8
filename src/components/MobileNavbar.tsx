import { Home, Sparkles, Radar as RadarIcon, MessageCircle, Play } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/useChat";
import { useUnreadChatStore } from "@/store/useUnreadChatStore";
import { useI18n } from "@/lib/i18n";
import { useOcultoPlayAccess } from "@/hooks/useOcultoPlayAccess";
import { prefetchRoute } from "@/lib/routePrefetch";


import { MobileMenuDrawer } from "./MobileMenuDrawer";

export const highlightConfig: Record<string, { text: string; hover: string; glow: string; shadow: string }> = {
  aura:   { text: "text-fuchsia-400",   hover: "hover:text-fuchsia-300",   glow: "bg-fuchsia-500/15",   shadow: "drop-shadow-[0_0_4px_rgba(232,121,249,0.6)]" },
  radar:  { text: "text-amber-400",     hover: "hover:text-amber-300",     glow: "bg-amber-500/15",     shadow: "drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]" },
  chat:   { text: "text-cyan-400",      hover: "hover:text-cyan-300",      glow: "bg-cyan-500/15",      shadow: "drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]" },
  play:   { text: "text-orange-400",    hover: "hover:text-orange-300",    glow: "bg-orange-500/20",    shadow: "drop-shadow-[0_0_5px_rgba(251,146,60,0.8)]" },
  profile:{ text: "text-violet-400",    hover: "hover:text-violet-300",    glow: "bg-violet-500/15",    shadow: "drop-shadow-[0_0_4px_rgba(167,139,250,0.6)]" },
  menu:   { text: "text-emerald-400",   hover: "hover:text-emerald-300",   glow: "bg-emerald-500/15",   shadow: "drop-shadow-[0_0_4px_rgba(52,211,153,0.6)]" },
};

export function MobileNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  // Fonte da verdade vem da store global: qualquer instância de `useChat`
  // (MessagesPage, sidebar, navbar) empurra `totalUnreadCount` para a store
  // sempre que sua lista interna muda — inclusive o update OTIMISTA do
  // `markAsRead`. Isso faz o badge cair INSTANTANEAMENTE ao abrir uma
  // conversa, sem esperar realtime/refetch.
  // Mantemos `useChat()` montado aqui só para garantir hidratação inicial da
  // store (fetch + subscribe) caso o usuário entre direto numa rota que não
  // monta o MessagesPage.
  useChat();
  const unreadMessages = useUnreadChatStore((s) => s.totalUnreadCount);
  const { t } = useI18n();
  const { canAccess: canAccessPlay } = useOcultoPlayAccess();


  // Bottom nav fixa: Menu (drawer) + Início, Aura, Radar, Chat, Play (quando liberado).
  // "Você" foi removido — Perfil agora vive em Menu > Meu Perfil.
  const navItems = [
    { icon: Home,         label: t("nav.home"),    href: "/feed",         highlight: false },
    { icon: Sparkles,     label: t("nav.aura"),    href: "/aura-match",   highlight: true,  highlightKey: "aura" },
    { icon: RadarIcon,    label: t("nav.radar"),   href: "/radar",        highlight: true,  highlightKey: "radar" },
    { icon: MessageCircle,label: t("nav.chat"),    href: "/messages",     highlight: true,  highlightKey: "chat",   hasBadge: true },
    ...(canAccessPlay ? [{ icon: Play, label: "Play", href: "/oculto-play", highlight: true, highlightKey: "play" }] : []),
  ];


  return (
    <>
      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-[60] md:hidden" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
        {/* Solid background */}
        <div className="absolute inset-0 bg-background border-t border-border/50" />
        
        <div className="relative flex w-full items-center justify-around gap-0 px-0.5 py-2 pb-[max(env(safe-area-inset-bottom,8px),8px)]">
          {/* Menu Drawer Button */}
          <MobileMenuDrawer />

          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            const cfg = item.highlightKey ? highlightConfig[item.highlightKey] : null;
            
            // Determine badge count
            let badgeCount = 0;
            if (item.hasBadge) {
              if (item.href === '/messages') badgeCount = unreadMessages;
            }
            
            return (
              <button
                key={item.label}
                type="button"
                onPointerEnter={() => prefetchRoute(item.href)}
                onPointerDown={() => prefetchRoute(item.href)}
                onFocus={() => prefetchRoute(item.href)}
                onClick={(e) => {
                  e.preventDefault();
                  // Sempre navega — se já estiver na rota, força re-mount com state.
                  if (location.pathname === item.href) {
                    navigate(item.href, { replace: true, state: { __ts: Date.now() } });
                  } else {
                    navigate(item.href);
                  }
                }}
                className={cn(
                  "relative flex min-w-0 flex-1 basis-0 flex-col items-center justify-center px-0.5 py-1.5 transition-colors touch-manipulation select-none active:scale-95",
                  isActive
                    ? "text-primary"
                    : cfg
                      ? cn(cfg.text, cfg.hover)
                      : "text-muted-foreground hover:text-foreground"
                )}
                aria-label={item.label}
              >
                <div className="relative pointer-events-none">
                  {cfg && !isActive && (
                    <span className={cn(
                      "absolute -inset-1 rounded-full blur-[2px] animate-pulse pointer-events-none",
                      cfg.glow
                    )} aria-hidden="true" />
                  )}
                  <Icon
                    className={cn(
                      "h-[23px] w-[23px] transition-transform relative",
                      isActive && "scale-110",
                      cfg && !isActive && cfg.shadow
                    )}
                    strokeWidth={isActive ? 2.5 : cfg ? 2.4 : 2}
                  />
                  {/* Badge */}
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-primary-foreground bg-destructive rounded-full">
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[9px] min-[380px]:text-[10px] mt-1 leading-none truncate max-w-full pointer-events-none",
                  cfg && !isActive ? "font-bold" : "font-medium"
                )}>{item.label}</span>

                {/* Active indicator line */}
                {isActive && (
                  <div className="absolute -bottom-0.5 w-8 h-0.5 rounded-full bg-primary pointer-events-none" />
                )}
              </button>
            );

          })}
        </div>
      </nav>
    </>
  );
}