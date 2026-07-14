/**
 * Página de Feed do Modo Espião
 * Layout especial para visitantes sem login
 */
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SpyModeSidebar, SpyModeHeader, SpyModeNavbar, SpyModeFeed } from "@/components/spy";
import { useSpyModeStore } from "@/store/useSpyModeStore";
import { Logo } from "@/components/Logo";

export default function SpyFeedPage() {
  const [searchParams] = useSearchParams();
  const { enableSpyMode } = useSpyModeStore();

  // Ativar modo espião ao montar
  useEffect(() => {
    enableSpyMode();
  }, [enableSpyMode]);

  return (
    <div className="min-h-dvh bg-background">
      {/* Navbar Desktop */}
      <SpyModeDesktopNav />

      {/* Mobile Header */}
      <SpyModeHeader />

      {/* Layout Principal */}
      <div className="flex">
        {/* Sidebar Esquerda - Desktop */}
        <SpyModeSidebar />

        {/* Feed Central */}
        <main className="flex-1 min-h-dvh max-w-3xl mx-auto w-full border-x border-border/30">
          <SpyModeFeed />
        </main>

        {/* Sidebar Direita - Inbox (bloqueado visualmente) */}
        <div className="hidden xl:block w-56 border-l border-border/30 opacity-30 pointer-events-none">
          <div className="sticky top-16 h-[calc(100vh-4rem)] p-4">
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">💬 Chat bloqueado</p>
              <p className="text-xs mt-1">Crie uma conta para conversar</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <SpyModeNavbar />
    </div>
  );
}

// Navbar Desktop para Modo Espião
function SpyModeDesktopNav() {
  return (
    <header className="hidden md:flex sticky top-0 z-50 w-full border-b border-border/30 bg-background/95 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-6 w-full">
        <Link to="/" className="flex items-center gap-2">
          <Logo />
        </Link>

        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-400/10 border border-yellow-400/30">
          <span className="text-sm font-semibold text-yellow-400 glow-yellow-pulse">👁️ CURIOSO</span>
          <span className="text-xs text-muted-foreground">• Modo Visitante</span>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/login">
            <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Entrar
            </button>
          </Link>
          <Link to="/signup">
            <button className="px-5 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(255,0,127,0.3)]">
              Criar Conta
            </button>
          </Link>
        </div>
      </div>
    </header>
  );
}
