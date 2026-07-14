import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Shield, AlertTriangle, Scale, Phone, Cookie, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

// Links legais principais incluindo Política de Cookies e Canal LGPD
const legalLinks = [
  { label: "Termos de Uso", href: "/legal/termos-de-uso", icon: FileText },
  { label: "Privacidade", href: "/legal/privacidade", icon: Shield },
  { label: "Política de Conteúdo", href: "/legal/conteudo", icon: AlertTriangle },
  { label: "Política de Cookies", href: "/legal/cookies", icon: Cookie },
  { label: "2257 Compliance", href: "/legal/2257-compliance", icon: Scale },
  { label: "Canal de Denúncia LGPD", href: "/support?tab=tickets&category=lgpd", icon: AlertCircle },
  { label: "Autoridades", href: "/legal/autoridades", icon: Phone },
];

interface LegalFooterProps {
  variant?: "landing" | "sidebar";
}

export function LegalFooter({ variant = "landing" }: LegalFooterProps) {
  const [expanded, setExpanded] = useState(false);

  if (variant === "sidebar") {
    return (
      <div className="mt-auto pt-4 border-t border-border/30">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <span className="font-medium uppercase tracking-wider">Legal</span>
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>

        {expanded && (
          <div className="animate-fade-in">
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-2">
              {legalLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            {/* Aviso de Prevenção ao Vício - PL 4540/24 */}
            <p className="text-[8px] text-muted-foreground/40 px-3 pb-2 leading-tight">
              ⚠️ Aviso: O consumo excessivo de conteúdo adulto pode causar dependência. Pratique o consumo consciente.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-border/30 mt-8 pt-6">
      <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
        {legalLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              to={link.href}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Icon className="h-3 w-3" />
              {link.label}
            </Link>
          );
        })}
      </div>
      
      {/* Aviso de Prevenção ao Vício - PL 4540/24 */}
      <p className="text-center text-[10px] text-muted-foreground/60 mt-4 px-4">
        ⚠️ Aviso: O consumo excessivo de conteúdo adulto pode causar dependência. Pratique o consumo consciente.
      </p>
      
      <p className="text-center text-[10px] text-muted-foreground/60 mt-2">
        © 2025 OCULTO. Todos os direitos reservados. Conteúdo restrito a maiores de 18 anos.
      </p>
      <p className="text-center text-[8px] text-muted-foreground/30 mt-1 select-none">v2.0 - Vercel</p>
    </div>
  );
}
