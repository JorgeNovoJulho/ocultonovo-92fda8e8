/**
 * MiningBalanceChip — mostrador de saldo XP em tempo real para a Sala Mineração.
 *
 * Renderiza um chip dourado discreto exibindo o `aura_xp` atual do usuário.
 * Pulsa brevemente quando o saldo muda (efeito visual flat, sem heavy shadows
 * — compatível com Realme C55 e similares).
 *
 * Fonte: useAuraProgress(true) — já reage a AURA_XP_LEDGER_LOCAL_EVENT disparado
 * por useMiningRoom.awardEvent e pelo realtime do oculto_aura_xp_interaction_ledger.
 */
import { useEffect, useRef, useState } from 'react';
import { Pickaxe } from 'lucide-react';
import { useAuraProgress } from '@/hooks/useAuraProgress';
import { SyncStatusDot } from './SyncStatusDot';

function formatXp(n: number): string {
  if (n >= 1000) return n.toLocaleString('pt-BR');
  return String(n);
}

export function MiningBalanceChip() {
  const { progress } = useAuraProgress(true);
  const xp = progress?.xp ?? 0;
  const prev = useRef(xp);
  const [pulse, setPulse] = useState(false);
  const [delta, setDelta] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);

  useEffect(() => {
    if (prev.current !== xp) {
      const d = xp - prev.current;
      prev.current = xp;
      setLastSync(Date.now());
      if (d !== 0) {
        setDelta(d);
        setPulse(true);
        const t1 = window.setTimeout(() => setPulse(false), 600);
        const t2 = window.setTimeout(() => setDelta(null), 1800);
        return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
      }
    }
  }, [xp]);

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={
          'relative inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-amber-200 transition-colors ' +
          (pulse ? 'bg-amber-500/25 border-amber-300/70' : '')
        }
        aria-label={`Saldo de XP: ${xp}`}
        title="Saldo de XP em tempo real"
      >
        <Pickaxe className="h-3 w-3" aria-hidden="true" />
        <span className="tabular-nums">{formatXp(xp)} XP</span>
        {delta !== null && (
          <span
            className={
              'absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-[1px] text-[9px] font-bold animate-fade-in ' +
              (delta > 0 ? 'bg-emerald-500/90 text-black' : 'bg-rose-500/90 text-white')
            }
          >
            {delta > 0 ? `+${delta}` : `${delta}`}
          </span>
        )}
      </span>
      <SyncStatusDot lastUpdate={lastSync} label="Saldo de XP" />
    </span>
  );
}

