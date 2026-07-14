import { ShieldCheck, EyeOff, Sparkles, Zap } from "lucide-react";

const items = [
  { icon: ShieldCheck, label: "Perfis verificados", hint: "KYC + selo oficial" },
  { icon: EyeOff, label: "Modo Fantasma", hint: "Navegue invisível" },
  { icon: Zap, label: "Cadastro instantâneo", hint: "Acesso em 30s" },
  { icon: Sparkles, label: "Comunidade premium", hint: "+18 verificada" },
];

export function ShareBenefitsStrip() {
  return (
    <div className="w-full max-w-sm mx-auto mt-6 grid grid-cols-2 gap-2">
      {items.map(({ icon: Icon, label, hint }) => (
        <div
          key={label}
          className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-left"
        >
          <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-foreground leading-tight truncate">{label}</p>
            <p className="text-[10px] text-muted-foreground leading-tight truncate">{hint}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
