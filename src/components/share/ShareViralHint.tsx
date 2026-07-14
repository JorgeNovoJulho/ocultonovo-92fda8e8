import { Gift } from "lucide-react";

export function ShareViralHint() {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left">
      <Gift className="h-4 w-4 text-primary shrink-0" />
      <p className="text-[11px] text-foreground/85 leading-snug">
        <span className="font-semibold text-primary">Indique e ganhe:</span> compartilhe seu link e ganhe
        créditos a cada novo membro confirmado.
      </p>
    </div>
  );
}
