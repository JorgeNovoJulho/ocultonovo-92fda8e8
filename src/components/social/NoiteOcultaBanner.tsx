import { memo } from 'react';
import { useNoiteOculta } from '@/social-universe';
import { Moon } from 'lucide-react';

function fmt(secs: number) {
  if (secs <= 0) return 'expirando';
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

/**
 * NoiteOcultaBanner — mostra a noite social ativa (se houver).
 * - Flat design, sem partículas, sem heavy box-shadow (regra mobile-perf).
 * - Hue dinâmico aplicado via gradiente sutil.
 */
function NoiteOcultaBannerComp() {
  const noite = useNoiteOculta();
  if (!noite) return null;

  const tint = `linear-gradient(90deg, hsl(${noite.hue} 70% 25% / 0.45), hsl(${(noite.hue + 40) % 360} 60% 20% / 0.25))`;

  return (
    <div
      className="relative flex items-center gap-2 overflow-hidden rounded-2xl border border-white/10 px-3 py-2"
      style={{ background: tint }}
      role="status"
      aria-live="polite"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40">
        <span aria-hidden className="text-base">{noite.emoji || '🌙'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[12px] font-bold text-white/90">
          <Moon className="h-3 w-3 opacity-70" aria-hidden />
          {noite.title}
          {noite.vip_only && (
            <span className="ml-1 rounded bg-amber-500/30 px-1.5 text-[9px] font-bold text-amber-200">
              VIP
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-white/70">
          {noite.subtitle || 'Universo em modo especial'} · termina em {fmt(noite.remaining_seconds)}
        </div>
      </div>
    </div>
  );
}

export const NoiteOcultaBanner = memo(NoiteOcultaBannerComp);
