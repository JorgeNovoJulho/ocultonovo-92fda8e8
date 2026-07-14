/**
 * Header Mobile para Modo Espião
 * Exibe "CURIOSO" como nome e avatar de silhueta
 */
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function SpyModeHeader() {
  return (
    <header className="flex md:hidden items-center justify-between px-4 h-14 sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/30">
      <Logo />
      
      {/* Info do Visitante */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-400/10 border border-yellow-400/30">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-muted text-muted-foreground">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-semibold text-yellow-400 glow-yellow-pulse">CURIOSO</span>
        </div>
        
        <Link to="/signup">
          <Button
            size="sm"
            className="h-8 px-3 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground text-xs font-semibold"
          >
            Criar Conta
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
