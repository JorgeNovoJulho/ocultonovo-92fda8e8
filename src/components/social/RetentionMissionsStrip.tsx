/**
 * RetentionMissionsStrip — tira destacada de missões diárias.
 * Responsiva: scroll horizontal invisível no mobile + setas de navegação no desktop.
 */
import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useRetentionMissions,
  useRetentionState,
  useRetentionTouch,
} from '@/hooks/retention/useRetention';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Gift, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

function RetentionMissionsStripComp() {
  useRetentionTouch();
  const navigate = useNavigate();
  const { data: missions = [], isLoading, claimXp, isClaiming } = useRetentionMissions();
  const { data: state } = useRetentionState();
  const [dismissed, setDismissed] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, missions.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(240, Math.round(el.clientWidth * 0.85));
    el.scrollBy({ left: dir * amount, behavior: 'smooth' });
  };

  if (dismissed) return null;

  // "Pendente" = ainda precisa fazer a ação OU já concluiu mas não resgatou.
  const actionPending = missions.filter((m) => !m.completed);
  const claimPending  = missions.filter((m) => m.completed && !m.claimed);
  const pending       = [...actionPending, ...claimPending];
  const done          = missions.filter((m) => m.completed).length;
  const isLastChance  = missions.some((m) => m.is_last_chance);
  const day           = state?.retention_day ?? 1;
  // Todas as missões do dia já concluídas E resgatadas → esconde a tira até
  // a meia-noite (próximo ciclo). Reaparece automaticamente no dia seguinte.
  const allDoneAndClaimed = missions.length > 0 && missions.every((m) => m.completed && m.claimed);

  if (!isLoading && missions.length === 0) return null;
  if (!isLoading && allDoneAndClaimed) return null;
  if (!isLoading && isLastChance && pending.length === 0) return null;

  // Ordem: ações pendentes > pronto p/ resgate > resgatadas.
  const orderRank = (m: typeof missions[number]) =>
    !m.completed ? 0 : !m.claimed ? 1 : 2;
  const ordered = [...missions].sort((a, b) => {
    const ra = orderRank(a); const rb = orderRank(b);
    if (ra !== rb) return ra - rb;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const handleClaim = async (key: string, title: string) => {
    if (claimingKey) return;
    setClaimingKey(key);
    try {
      const res: any = await claimXp(key);
      if (res?.ok && res.xp_awarded != null) {
        toast.success(`+${res.xp_awarded} XP — ${title}`, { duration: 2400 });
        if (res.cycle_bonus_awarded && res.cycle_bonus_xp) {
          toast.success(`Ciclo de 7 dias completo! Bônus +${res.cycle_bonus_xp} XP 🎉`, { duration: 5000 });
        }
      } else if (res?.reason === 'not_completed') {
        toast.error('Conclua a missão antes de resgatar o XP.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível resgatar o XP. Tente novamente.');
    } finally {
      setClaimingKey(null);
    }
  };


  if (isLoading) {
    return (
      <div className="rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-500/5 to-purple-500/5 p-3">
        <div className="flex items-center gap-2 text-pink-200/80">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">Missoes de hoje</span>
        </div>
        <p className="mt-1 text-xs text-white/55">Carregando suas missoes…</p>
      </div>
    );
  }

  const wrapperClass = isLastChance
    ? 'rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-pink-500/10 p-3 shadow-[0_0_0_1px_rgba(251,191,36,0.18)]'
    : 'rounded-2xl border border-pink-500/25 bg-gradient-to-br from-pink-500/10 via-purple-500/[0.06] to-transparent p-3 shadow-[0_0_0_1px_rgba(236,72,153,0.08)]';

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className={`h-4 w-4 shrink-0 ${isLastChance ? 'text-amber-300' : 'text-pink-300'}`} />
          <span className="text-sm font-semibold text-white truncate">
            {isLastChance ? 'Ultima chance — XP em dobro' : `Missoes do Dia ${day}`}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${
            isLastChance ? 'bg-amber-400/20 text-amber-100' : 'bg-white/10 text-white/80'
          }`}>
            Dia {day}/7
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-white/45 hover:text-white/90 shrink-0"
          aria-label="Dispensar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isLastChance && (
        <p className="px-1 pb-2 text-[11px] text-amber-100/90">
          Hoje e o ultimo dia! Conclua as missoes que faltam e ganhe <strong>XP em dobro</strong>.
        </p>
      )}

      <div className="relative">
        {/* Setas desktop — visíveis sempre que há overflow */}
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          disabled={!canScrollLeft}
          aria-label="Anterior"
          className={`hidden md:flex absolute -left-2 top-1/2 -translate-y-1/2 z-20 h-9 w-9 items-center justify-center rounded-full bg-black/80 backdrop-blur border border-white/20 text-white shadow-lg transition hover:bg-black hover:scale-105 ${
            canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          disabled={!canScrollRight}
          aria-label="Próximo"
          className={`hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-20 h-9 w-9 items-center justify-center rounded-full bg-black/80 backdrop-blur border border-white/20 text-white shadow-lg transition hover:bg-black hover:scale-105 ${
            canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Fade edges */}
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black/50 to-transparent rounded-l-xl z-[5]" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/50 to-transparent rounded-r-xl z-[5]" />
        )}

        <div
          ref={scrollerRef}
          className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch' }}
        >
          {ordered.map((m) => {
            const isDone     = !!m.completed;
            const isClaimed  = !!m.claimed;
            const canClaim   = isDone && !isClaimed;
            const busyClaim  = claimingKey === m.key || (isClaiming && canClaim && claimingKey == null);
            const bg = isClaimed
              ? 'linear-gradient(135deg, hsl(150 55% 24%) 0%, hsl(160 60% 16%) 100%)'
              : isDone
                ? 'linear-gradient(135deg, hsl(150 75% 36%) 0%, hsl(160 80% 24%) 100%)'
                : `linear-gradient(135deg, hsl(${m.hue} 65% 22% / 0.85), hsl(${m.hue} 55% 12% / 0.55))`;

            // Card é clicável só quando ainda não foi concluído (vai para a rota).
            const Tag: any = isDone ? 'div' : 'button';

            // Long-press no mobile mostra o nome completo via toast.
            let pressTimer: ReturnType<typeof setTimeout> | null = null;
            const startPress = () => {
              if (pressTimer) clearTimeout(pressTimer);
              pressTimer = setTimeout(() => {
                toast(m.title, { description: m.body || undefined, duration: 3000 });
              }, 450);
            };
            const cancelPress = () => {
              if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            };

            return (
              <Tag
                key={m.key}
                {...(!isDone && {
                  onClick: () => m.cta_route && navigate(m.cta_route),
                  type: 'button',
                })}
                onTouchStart={startPress}
                onTouchEnd={cancelPress}
                onTouchMove={cancelPress}
                onTouchCancel={cancelPress}
                onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); toast(m.title, { description: m.body || undefined, duration: 3000 }); }}
                title={m.title}
                aria-label={m.title}
                className={`group relative shrink-0 snap-start rounded-xl px-3 py-2.5 text-left transition active:scale-[0.98] basis-[78%] xs:basis-[60%] sm:basis-[42%] md:basis-[32%] lg:basis-[24%] max-w-[280px] min-w-[180px] ${
                  isDone
                    ? `border-2 ${canClaim ? 'border-emerald-300/80 shadow-[0_0_0_1px_rgba(16,185,129,0.45),0_10px_28px_-10px_rgba(16,185,129,0.7)]' : 'border-emerald-300/40'} cursor-default`
                    : 'border border-white/12 cursor-pointer'
                }`}
                style={{ background: bg }}
              >
                {isDone && (
                  <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 shadow">
                    <CheckCircle2 className="h-2.5 w-2.5" /> {isClaimed ? 'Resgatada' : 'Concluída'}
                  </span>
                )}
                <div className="flex items-start justify-between gap-2 pr-16">
                  <div
                    className="text-sm font-semibold leading-snug text-white break-words [overflow-wrap:anywhere] hyphens-auto"
                    title={m.title}
                  >
                    {m.title}
                  </div>
                  {!isDone && (
                    <ChevronRight className="h-4 w-4 mt-0.5 text-white/60 group-hover:translate-x-0.5 transition shrink-0" />
                  )}
                </div>
                {m.body && (
                  <div className={`mt-0.5 text-[11px] line-clamp-2 ${isDone ? 'text-emerald-50/95' : 'text-white/65'}`}>
                    {m.body}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {m.cta_label && !isDone && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/85">
                      {m.cta_label}
                    </span>
                  )}
                  {!isDone && m.xp_reward > 0 && (
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      m.is_last_chance
                        ? 'bg-amber-400/25 text-amber-100 ring-1 ring-amber-300/40'
                        : 'bg-yellow-400/20 text-yellow-100'
                    }`}>
                      +{m.xp_reward} XP{m.is_last_chance ? ' x2' : ''}
                    </span>
                  )}
                  {canClaim && (
                    <button
                      type="button"
                      disabled={busyClaim}
                      onClick={(e) => { e.stopPropagation(); handleClaim(m.key, m.title); }}
                      className="inline-flex items-center gap-1 rounded-md bg-white text-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow hover:bg-emerald-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                      aria-label={`Resgatar ${m.xp_reward} XP da missão ${m.title}`}
                    >
                      {busyClaim
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Gift className="h-3 w-3" />}
                      Resgatar +{m.xp_reward} XP
                    </button>
                  )}
                  {isClaimed && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-950/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-50 font-semibold">
                      +{m.xp_reward} XP recebido
                    </span>
                  )}
                </div>
              </Tag>
            );
          })}
        </div>
      </div>

      {done > 0 && (
        <div className="px-1 pt-2">
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-200 hover:bg-emerald-500/15 transition"
            aria-expanded={showCompleted}
          >
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {done} concluída(s) hoje
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showCompleted ? 'rotate-180' : ''}`}
            />
          </button>

          {showCompleted && (
            <ul className="mt-1.5 space-y-1 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] p-2">
              {missions
                .filter((m) => m.completed)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map((m) => (
                  <li
                    key={`done-${m.key}`}
                    className="flex items-start gap-2 rounded-md px-1.5 py-1 text-[11px] text-emerald-50"
                  >
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.title}</div>
                      {m.reward && (
                        <div className="truncate text-[10px] text-emerald-200/80">
                          Recompensa: {m.reward}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export const RetentionMissionsStrip = memo(RetentionMissionsStripComp);
