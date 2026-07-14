/**
 * SyncStatusDot — Indicador compacto "sincronizando / atualizado" para o painel
 * da Sala Mineração. Pisca em âmbar enquanto recebe um evento e volta a verde
 * com timestamp relativo. Flat e leve (Realme C55 friendly).
 */
import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  /** Timestamp (ms) do último evento aplicado a esta seção. */
  lastUpdate: number | null;
  /** Rótulo curto para leitores de tela. */
  label?: string;
  /** Duração do estado "sincronizando" (ms). Default 900. */
  syncMs?: number;
}

function relTime(ts: number, now: number): string {
  const d = Math.max(0, now - ts);
  if (d < 5_000) return 'agora';
  if (d < 60_000) return `${Math.floor(d / 1000)}s`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}min`;
  return `${Math.floor(d / 3_600_000)}h`;
}

export function SyncStatusDot({ lastUpdate, label = 'sincronização', syncMs = 900 }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!lastUpdate) return;
    setSyncing(true);
    const t = window.setTimeout(() => setSyncing(false), syncMs);
    return () => window.clearTimeout(t);
  }, [lastUpdate, syncMs]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  if (syncing) {
    return (
      <span
        role="status"
        aria-label={`${label}: sincronizando`}
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-[1px] text-[9px] font-medium text-amber-200"
      >
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        sincronizando…
      </span>
    );
  }

  if (!lastUpdate) {
    return (
      <span
        aria-label={`${label}: aguardando`}
        className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-1.5 py-[1px] text-[9px] text-foreground/55"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
        aguardando
      </span>
    );
  }

  return (
    <span
      aria-label={`${label}: atualizado há ${relTime(lastUpdate, now)}`}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/[0.12] px-1.5 py-[1px] text-[9px] font-medium text-emerald-300"
    >
      <CheckCircle2 className="h-2.5 w-2.5" />
      atualizado · {relTime(lastUpdate, now)}
    </span>
  );
}
