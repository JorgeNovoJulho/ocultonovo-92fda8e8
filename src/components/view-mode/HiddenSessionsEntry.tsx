import { Link, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useExperienceSettings } from "@/hooks/useExperienceSettings";
import { cn } from "@/lib/utils";


interface Props {
  variant?: "sidebar" | "drawer";
  onNavigate?: () => void;
}

/**
 * Entrada "Sessões Ocultas" — só aparece no Modo Simples e se o admin
 * tiver Sessões Ocultas ativadas (hidden_sessions_enabled). O título é
 * configurável via hidden_sessions_title.
 */
export function HiddenSessionsEntry({ variant = "sidebar", onNavigate }: Props) {
  const { data: settings } = useExperienceSettings();
  const { pathname } = useLocation();

  // Sempre visível no menu (sidebar/drawer), em qualquer modo de visualização.
  // Só esconde dentro do /admin ou se o admin desligar Sessões Ocultas.
  if (pathname.startsWith("/admin")) return null;
  if (settings && settings.hidden_sessions_enabled === false) return null;


  const isActive = pathname === "/sessoes-ocultas";
  const title = settings?.hidden_sessions_title?.trim() || "Sessões Ocultas";

  return (
    <Link
      to="/sessoes-ocultas"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full",
        isActive
          ? "text-primary bg-primary/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
      )}
      aria-label={title}
    >
      <Sparkles className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-amber-400")} />
      <span className="flex-1 text-left">{title}</span>
    </Link>
  );
}
