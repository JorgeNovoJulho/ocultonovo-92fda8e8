import { Sparkles, Shield, Zap, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuraProgress } from '@/hooks/useAuraProgress';
import { useSocialScore } from '@/hooks/useSocialScore';
import { useProfile } from '@/hooks/useProfile';
import { AuraXpLedgerDialog } from '@/components/aura/AuraXpLedgerDialog';
import { cn } from '@/lib/utils';

/**
 * Top bar oficial do Aura Match — fonte da verdade visível para o usuário:
 *   • Nível Aura (useAuraProgress)
 *   • Score Social (useSocialScore)
 *   • Saldo total de XP (Aura XP acumulado)
 *
 * Esses MESMOS valores são lidos pelo gate das salas
 * (AuraRoomRequirementsLine), garantindo sincronia 1-para-1
 * entre o que o usuário vê aqui e o que destrava as salas.
 */
export function AuraStatsTopBar({ className }: { className?: string }) {
  const { profile } = useProfile();
  const { progress } = useAuraProgress(false);
  const { data: social } = useSocialScore(profile?.id);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const auraLevel = progress?.level ?? 1;
  const xpTotal = progress?.xp ?? 0;
  const xpInLevel = progress?.xp_in_level ?? 0;
  const xpToNext = progress?.xp_to_next ?? 50;
  const pctInLevel = Math.min(100, Math.round((xpInLevel / Math.max(1, xpToNext)) * 100));

  const socialScore = social?.xp ?? 0;
  const socialLevel = social?.level ?? 1;
  const socialPct = social?.progress_pct ?? 0;
  const glow = social ? `hsl(${social.glow_color})` : 'hsl(280 90% 65%)';

  return (
    <section
      className={cn(
        'grid grid-cols-3 gap-2 rounded-2xl border border-border/40 bg-card/60 dark:border-white/5 dark:bg-white/[0.02] p-2',
        className,
      )}
      aria-label="Seus números oficiais — usados para destravar as salas"
    >
      {/* Aura Level */}
      <Link
        to="#aura-anchor-quests"
        className="group flex flex-col gap-1 rounded-xl border border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-500/15 to-transparent p-2 transition-colors hover:border-fuchsia-500/60 dark:border-fuchsia-500/20 dark:from-fuchsia-500/10 dark:hover:border-fuchsia-400/40"
        title="Nível Aura — sobe com missões, super DMs e presença"
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300/80">
            <Sparkles className="h-3 w-3" /> Aura
          </span>
          <span className="text-[10px] font-semibold text-fuchsia-700/90 dark:text-fuchsia-200/70">Nv {auraLevel}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold leading-none text-fuchsia-700 dark:text-fuchsia-200 tabular-nums">{auraLevel}</span>
          <span className="text-[10px] text-muted-foreground">/ nível</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-fuchsia-500/10 dark:bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-400 transition-all"
            style={{ width: `${pctInLevel}%` }}
          />
        </div>
        <span className="text-[9px] text-foreground/70 dark:text-muted-foreground tabular-nums">
          {xpInLevel}/{xpToNext} para Nv {auraLevel + 1}
        </span>
      </Link>

      {/* Social Score */}
      <Link
        to="/dashboard"
        className="group flex flex-col gap-1 rounded-xl border p-2 transition-colors hover:opacity-95"
        style={{
          borderColor: `${glow.replace('hsl(', 'hsla(').replace(')', ', 0.45)')}`,
          background: `linear-gradient(135deg, ${glow.replace('hsl(', 'hsla(').replace(')', ', 0.18)')}, transparent)`,
        }}
        title="Score Social — reputação + reação positiva da comunidade"
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: glow }}>
            <Shield className="h-3 w-3" /> Score
          </span>
          <span className="text-[10px] font-semibold" style={{ color: glow }}>
            Nv {socialLevel}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold leading-none tabular-nums" style={{ color: glow }}>
            {socialScore.toLocaleString('pt-BR')}
          </span>
          <span className="text-[10px] text-muted-foreground">pts</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10 dark:bg-white/5">
          <div
            className="h-full transition-all"
            style={{ width: `${Math.min(100, socialPct)}%`, background: glow }}
          />
        </div>
        <span className="text-[9px] text-foreground/70 dark:text-muted-foreground truncate">
          {social?.level_name ?? 'Calculando…'}
        </span>
      </Link>

      {/* Total XP */}
      <button
        type="button"
        onClick={() => setLedgerOpen(true)}
        className="group flex flex-col gap-1 rounded-xl border border-amber-500/50 bg-gradient-to-br from-amber-500/20 to-transparent p-2 text-left transition-colors hover:border-amber-500/70 dark:border-amber-500/25 dark:from-amber-500/12 dark:hover:border-amber-400/45"
        title="Ver histórico de XP de Aura (entradas e saídas)"
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300/85">
            <Zap className="h-3 w-3" /> XP total
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700/90 group-hover:text-amber-800 dark:text-amber-200/70 dark:group-hover:text-amber-300">
            <History className="h-3 w-3" /> histórico
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold leading-none text-amber-700 dark:text-amber-200 tabular-nums">
            {xpTotal.toLocaleString('pt-BR')}
          </span>
          <span className="text-[10px] text-muted-foreground">xp</span>
          {progress?.streak_days ? (
            <span className="ml-auto text-[10px] font-semibold text-orange-600 dark:text-orange-300">🔥 {progress.streak_days}d</span>
          ) : null}
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-amber-500/15 dark:bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
            style={{ width: `${pctInLevel}%` }}
          />
        </div>
        <span className="text-[9px] text-foreground/70 dark:text-muted-foreground">
          Toque para ver entradas e saídas
        </span>
      </button>

      <AuraXpLedgerDialog open={ledgerOpen} onOpenChange={setLedgerOpen} />
    </section>
  );
}
