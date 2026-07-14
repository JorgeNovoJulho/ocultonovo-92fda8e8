/**
 * Navbar Mobile para Modo Espião
 * Todos os itens bloqueados exceto Início, sem Chat
 */
import { Home, Radar, Bell, User, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// Itens de navegação para modo espião (sem Chat)
const spyNavItems = [
  { icon: Home, label: "Início", href: "/feed", locked: false },
  { icon: Radar, label: "Radar", href: "/radar", locked: true },
  { icon: Bell, label: "Alertas", href: "/notifications", locked: true },
  { icon: User, label: "Entrar", href: "/signup", locked: false, isAction: true },
];

export function SpyModeNavbar() {
  return (
    <>
      {/* Spacer */}
      <div className="h-16 md:hidden" />
      
      {/* Mobile Bottom Navigation - Modo Espião */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="absolute inset-0 bg-background border-t border-border/50" />
        
        <div className="relative flex items-center justify-around px-2 py-2 pb-[env(safe-area-inset-bottom,8px)]">
          {spyNavItems.map((item) => {
            const Icon = item.icon;
            const isAction = item.isAction;
            
            // Itens bloqueados
            if (item.locked) {
              return (
                <div
                  key={item.label}
                  className="relative flex flex-col items-center justify-center p-2 min-w-[56px] opacity-40 pointer-events-none"
                >
                  <div className="relative">
                    <Icon className="h-6 w-6 text-muted-foreground" strokeWidth={2} />
                    {/* Ícone de cadeado */}
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-muted flex items-center justify-center">
                      <Lock className="h-2.5 w-2.5 text-muted-foreground" />
                    </div>
                  </div>
                  <span className="text-[10px] font-medium mt-1 text-muted-foreground">{item.label}</span>
                </div>
              );
            }
            
            // Item de ação (Entrar)
            if (isAction) {
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className="relative flex flex-col items-center justify-center p-2 min-w-[56px]"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center shadow-[0_0_15px_rgba(255,0,127,0.4)]">
                    <Icon className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
                  </div>
                  <span className="text-[10px] font-semibold mt-1 text-primary">{item.label}</span>
                </Link>
              );
            }
            
            // Item ativo (Início)
            return (
              <Link
                key={item.label}
                to={item.href}
                className="relative flex flex-col items-center justify-center p-2 min-w-[56px] text-primary"
              >
                <Icon className="h-6 w-6 scale-110" strokeWidth={2.5} />
                <span className="text-[10px] font-medium mt-1">{item.label}</span>
                <div className="absolute -bottom-0.5 w-8 h-0.5 rounded-full bg-primary" />
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
