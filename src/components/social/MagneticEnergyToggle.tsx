import { memo, useState } from 'react';
import { useMagneticEnergy } from '@/social-universe';
import { Magnet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { EconomyBuyButton } from './EconomyBuyButton';

function fmt(secs: number) {
  const m = Math.max(0, Math.floor(secs / 60));
  return `${m} min`;
}

/**
 * MagneticEnergyToggle — boost discreto (não é Tinder Boost).
 * - Estado ativo: barra de tempo restante.
 * - Estado inativo: botão "Ativar Energia Magnética" (30 min, x1.5).
 */
function MagneticEnergyToggleComp() {
  const { status, activate, isLoading } = useMagneticEnergy();
  const [busy, setBusy] = useState(false);

  const handleActivate = async () => {
    setBusy(true);
    try {
      await activate(30, 1.5, 'manual');
      toast.success('Energia magnética ativada por 30 min');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível ativar agora');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return null;

  if (status.active) {
    const total = 30 * 60;
    const pct = Math.min(100, ((status.remaining_seconds ?? 0) / total) * 100);
    return (
      <div className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-950/30 p-3">
        <div className="flex items-center gap-2 text-[12px] font-bold text-fuchsia-100">
          <Magnet className="h-3.5 w-3.5" aria-hidden />
          Energia magnética ativa
          <span className="ml-auto text-[10px] tabular-nums text-fuchsia-200/80">
            x{status.multiplier?.toFixed(2)}
          </span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-fuchsia-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-[10px] text-fuchsia-200/70">
          Mais descoberta · {fmt(status.remaining_seconds ?? 0)} restantes
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleActivate}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/20 px-3 py-2 text-[12px] font-bold text-emerald-50 shadow-[0_0_20px_-8px_hsl(160_80%_50%/0.6)] transition hover:from-emerald-500/40 hover:via-teal-500/30 hover:to-cyan-500/30 hover:border-emerald-300/60 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Magnet className="h-3.5 w-3.5" />}
        Ativar Energia Magnética · 30 min
      </button>
      {/* Paywall PIX — Economia Social Premium (backend valida cooldown/limit/min_plan). */}
      <EconomyBuyButton
        slug="energia_magnetica_30"
        label="Comprar boost (PIX)"
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1.5 text-[11px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20"
      />
    </div>
  );
}

export const MagneticEnergyToggle = memo(MagneticEnergyToggleComp);
