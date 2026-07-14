/**
 * Sidebar para Modo Espião (Desktop)
 * Itens bloqueados visualmente, sem Chat
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LegalFooter } from "@/components/LegalFooter";
import {
  Home,
  Radar,
  Eye,
  Heart,
  Bookmark,
  DollarSign,
  Settings,
  PartyPopper,
  Users,
  Crown,
  LifeBuoy,
  BarChart3,
  Ticket,
  FolderOpen,
  Bell,
  Flame,
  Lock,
  User,
  ArrowRight,
} from "lucide-react";

// Itens da navegação no modo espião
const spyNavItems = [
  { icon: Home, label: "Início", href: "/feed", locked: false },
  { icon: Radar, label: "Radar", href: "/radar", locked: true },
  { icon: Flame, label: "Matches", href: "/matches", locked: true },
  { icon: Bell, label: "Notificações", href: "/notifications", locked: true },
  { icon: Eye, label: "Visitas Recebidas", href: "/visits", locked: true },
  { icon: Heart, label: "Curtidas", href: "/likes", locked: true },
  { icon: Users, label: "Seguidores", href: "/followers", locked: true },
  { icon: Bookmark, label: "Salvos", href: "/saved", locked: true },
  { icon: FolderOpen, label: "Minhas Mídias", href: "/my-media", locked: true },
  { icon: Crown, label: "Assinaturas", href: "/subscriptions", locked: true },
  { icon: PartyPopper, label: "Eventos", href: "/events", locked: true },
  { icon: DollarSign, label: "Rendimentos", href: "/earnings", locked: true },
  { icon: BarChart3, label: "Detalhamento", href: "/earnings/breakdown", locked: true },
  { icon: Ticket, label: "Cupons", href: "/earnings/coupons", locked: true },
  { icon: LifeBuoy, label: "Suporte", href: "/support", locked: true },
  { icon: Settings, label: "Configurações", href: "/settings", locked: true },
];

export function SpyModeSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 h-[calc(100vh-4rem)] sticky top-16 p-4 border-r border-border/30 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {/* Card de Visitante */}
      <div className="mb-6 p-3 rounded-xl bg-primary/5 border border-primary/30">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 ring-2 ring-primary/30">
            <AvatarFallback className="bg-muted text-muted-foreground">
              <User className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-yellow-400 truncate text-sm glow-yellow-pulse">
              CURIOSO
            </p>
            <p className="text-xs text-muted-foreground truncate">
              Modo Visitante
            </p>
          </div>
        </div>
      </div>

      {/* Botão de Cadastro */}
      <Link to="/signup" className="w-full mb-6">
        <Button
          className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold text-base shadow-[0_0_15px_rgba(255,0,127,0.3)]"
        >
          Criar Conta
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </Link>

      {/* Navegação bloqueada */}
      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide">
        {spyNavItems.map((item) => {
          const Icon = item.icon;
          
          if (item.locked) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground/50 opacity-50 pointer-events-none"
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  <Lock className="absolute -top-1 -right-1 h-3 w-3 text-muted-foreground" />
                </div>
                <span className="flex-1">{item.label}</span>
              </div>
            );
          }
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm bg-primary/10 text-primary font-medium"
            >
              <Icon className="h-5 w-5 text-primary" />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Legal */}
      <div className="mt-4 pt-3 border-t border-border/30">
        <LegalFooter variant="sidebar" />
      </div>
    </aside>
  );
}
