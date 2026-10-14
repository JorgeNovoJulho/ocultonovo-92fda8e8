import { useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useAuraAchievements, type Achievement } from '@/hooks/useAuraAchievements';
import {
  Flame, Star, Crown, Sparkles, Heart, Trophy, Lock, X, CheckCircle2,
  Users, Music, MessageCircle, Mic, Magnet, BarChart3, Info, Zap, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';


const ICON_MAP = {
  flame: Flame, star: Star, crown: Crown, sparkles: Sparkles, heart: Heart, trophy: Trophy,
  users: Users, music: Music, chat: MessageCircle, mic: Mic, magnet: Magnet, rank: BarChart3,
} as const;

// Cor única por conquista (id) — paleta variada para o grid ficar vivo.
const ID_COLOR: Record<string, { ring: string; text: string; bg: string; bar: string; glow: string }> = {
  lvl_5:     { ring: 'ring-amber-400/80',    text: 'text-amber-300',    bg: 'bg-amber-400/10',    bar: 'bg-amber-400',    glow: 'shadow-amber-400/30' },
  lvl_10:    { ring: 'ring-yellow-300/80',   text: 'text-yellow-200',   bg: 'bg-yellow-300/10',   bar: 'bg-yellow-300',   glow: 'shadow-yellow-300/30' },
  lvl_20:    { ring: 'ring-fuchsia-400/80',  text: 'text-fuchsia-300',  bg: 'bg-fuchsia-400/10',  bar: 'bg-fuchsia-400',  glow: 'shadow-fuchsia-400/30' },
  streak_3:  { ring: 'ring-orange-400/80',   text: 'text-orange-300',   bg: 'bg-orange-400/10',   bar: 'bg-orange-400',   glow: 'shadow-orange-400/30' },
  streak_7:  { ring: 'ring-red-400/80',      text: 'text-red-300',      bg: 'bg-red-400/10',      bar: 'bg-red-400',      glow: 'shadow-red-400/30' },
  streak_30: { ring: 'ring-rose-500/80',     text: 'text-rose-300',     bg: 'bg-rose-500/10',     bar: 'bg-rose-500',     glow: 'shadow-rose-500/30' },
  visits_15: { ring: 'ring-cyan-400/80',     text: 'text-cyan-300',     bg: 'bg-cyan-400/10',     bar: 'bg-cyan-400',     glow: 'shadow-cyan-400/30' },
  quests_10: { ring: 'ring-emerald-400/80',  text: 'text-emerald-300',  bg: 'bg-emerald-400/10',  bar: 'bg-emerald-400',  glow: 'shadow-emerald-400/30' },
  quests_50: { ring: 'ring-teal-400/80',     text: 'text-teal-300',     bg: 'bg-teal-400/10',     bar: 'bg-teal-400',     glow: 'shadow-teal-400/30' },
  sdm_5:     { ring: 'ring-pink-400/80',     text: 'text-pink-300',     bg: 'bg-pink-400/10',     bar: 'bg-pink-400',     glow: 'shadow-pink-400/30' },
  xp_1000:   { ring: 'ring-violet-400/80',   text: 'text-violet-300',   bg: 'bg-violet-400/10',   bar: 'bg-violet-400',   glow: 'shadow-violet-400/30' },
  play_movie_1:  { ring: 'ring-sky-400/80',     text: 'text-sky-300',     bg: 'bg-sky-400/10',     bar: 'bg-sky-400',     glow: 'shadow-sky-400/30' },
  play_movie_5:  { ring: 'ring-blue-400/80',    text: 'text-blue-300',    bg: 'bg-blue-400/10',    bar: 'bg-blue-400',    glow: 'shadow-blue-400/30' },
  play_movie_15: { ring: 'ring-fuchsia-400/80', text: 'text-fuchsia-300', bg: 'bg-fuchsia-400/10', bar: 'bg-fuchsia-400', glow: 'shadow-fuchsia-400/30' },
};
const FALLBACK_STYLE = { ring: 'ring-slate-400/70', text: 'text-slate-300', bg: 'bg-slate-400/10', bar: 'bg-slate-400', glow: 'shadow-slate-400/20' };

const TIER_LABEL: Record<Achievement['tier'], string> = {
  bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', platina: 'Platina',
};

type FilterMode = 'all' | 'in_progress' | 'unlocked' | 'rare_pending';

export function AuraAchievements() {
  const { achievements, unlockedCount, totalCount, pendingClaimCount, claim, claimAll, metrics } = useAuraAchievements();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const expanded = expandedId ? achievements.find((a) => a.id === expandedId) ?? null : null;

  const auraLevel = metrics?.current_level ?? 1;
  const auraXp = metrics?.total_xp ?? 0;
  const myRank = metrics?.engagement_rank ?? 0;

  const visible = achievements.filter((a) =>
    filter === 'all' ? true
      : filter === 'unlocked' ? a.unlocked
      : filter === 'rare_pending' ? (a.isRare && !a.claimed)
      : !a.unlocked
  );
  const rarePendingCount = achievements.filter((a) => a.isRare && !a.claimed).length;
  const inProgressCount = totalCount - unlockedCount;

  const handleClaim = async (id: string) => {
    setClaimingId(id);
    try { await claim(id); } finally { setClaimingId(null); }
  };

  const handleClaimAll = async () => {
    setClaimingAll(true);
    try { await claimAll(); } finally { setClaimingAll(false); }
  };

  const chip = (mode: FilterMode, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setFilter(mode)}
      className={cn(
        'px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors',
        filter === mode
          ? 'bg-amber-400/20 border-amber-400/60 text-amber-200'
          : 'bg-background/40 border-border/40 text-muted-foreground hover:text-foreground'
      )}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );

  return (
    <LayoutGroup>
    {/* Sem `layout`: a animação de layout do framer-motion escala o bloco
        inteiro com transform e, no celular, a camada era rasterizada
        distorcida (faixas pixeladas). */}
    <motion.div
      className="rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/12 via-amber-500/6 to-orange-600/4 p-3 space-y-2 shadow-[0_0_24px_-12px_hsl(38_95%_55%/0.45)]"
    >

      {/* Cabeçalho — Nível atual + Posição no Ranking + Saiba mais */}
      <div className="rounded-lg border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-fuchsia-500/10 to-violet-600/10 p-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-amber-400/20 ring-2 ring-amber-400/70 flex items-center justify-center shadow-[0_0_14px_-2px_hsl(38_95%_55%/0.7)]">
            <Zap className="h-5 w-5 text-amber-300" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-wider text-amber-200/80 font-semibold">Seu nível Aura</div>
            <div className="text-base font-extrabold text-amber-100 tabular-nums">
              Nv. {auraLevel}
              <span className="ml-1.5 text-[10px] font-semibold text-amber-200/70">
                {auraXp.toLocaleString('pt-BR')} XP
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:ml-2">
          <div className="h-10 w-10 rounded-full bg-fuchsia-400/15 ring-2 ring-fuchsia-400/60 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-fuchsia-300" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-wider text-fuchsia-200/80 font-semibold">Ranking Aura</div>
            <div className="text-base font-extrabold text-fuchsia-100 tabular-nums">
              {myRank > 0 ? `#${myRank}` : 'Sem posição'}
              {myRank > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold text-fuchsia-200/70">
                  posição atual
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowHowTo(true)}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-amber-300/60 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 transition"
        >
          <Info className="h-3 w-3" /> Saiba mais
        </button>
      </div>

      {showHowTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowHowTo(false)}>
          <div
            className="relative w-full max-w-md rounded-2xl border border-amber-400/40 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-5 shadow-[0_0_40px_-8px_hsl(38_95%_55%/0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setShowHowTo(false)}
              className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/70 hover:bg-background text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-extrabold text-amber-100">Como subir no Ranking Aura</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Seu <strong className="text-amber-200">Nível</strong> sobe a cada faixa de XP acumulada. Sua <strong className="text-fuchsia-200">posição no Ranking</strong> é calculada por um score composto, em tempo real.
            </p>
            <ul className="space-y-2 text-xs text-foreground/90">
              <li className="flex items-start gap-2">
                <Zap className="h-3.5 w-3.5 mt-0.5 text-amber-300 shrink-0" />
                <span><strong>+XP da Aura</strong> (peso 1): missões diárias, presença em salas, curtidas, comentários, super DM, presentes e conquistas.</span>
              </li>
              <li className="flex items-start gap-2">
                <Mic className="h-3.5 w-3.5 mt-0.5 text-pink-300 shrink-0" />
                <span><strong>Bio de áudio</strong> (×5 por like líquido): grave sua voz e receba curtidas reais.</span>
              </li>
              <li className="flex items-start gap-2">
                <Crown className="h-3.5 w-3.5 mt-0.5 text-yellow-300 shrink-0" />
                <span><strong>Nível atual</strong> (×100): cada nível conquistado já te empurra para cima.</span>
              </li>
              <li className="flex items-start gap-2">
                <Trophy className="h-3.5 w-3.5 mt-0.5 text-emerald-300 shrink-0" />
                <span><strong>Conquistas resgatadas</strong> (×20): cada conquista paga XP e ainda boosta o ranking.</span>
              </li>
              <li className="flex items-start gap-2">
                <Users className="h-3.5 w-3.5 mt-0.5 text-cyan-300 shrink-0" />
                <span><strong>Visitas únicas ao seu perfil</strong> (×2): perfis completos com avatar, bio e mídia atraem mais visitas.</span>
              </li>
              <li className="flex items-start gap-2">
                <Flame className="h-3.5 w-3.5 mt-0.5 text-orange-300 shrink-0" />
                <span><strong>Streak diário</strong>: entrar todo dia mantém o XP fluindo e protege sua posição.</span>
              </li>
            </ul>
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-[11px] text-amber-100">
              💡 Dica: complete as <strong>missões diárias</strong> e resgate suas <strong>conquistas</strong> aqui mesmo — é a forma mais rápida de escalar o Top 100 e mirar o Top 10.
            </div>
            <button
              type="button"
              onClick={() => setShowHowTo(false)}
              className="mt-4 w-full py-2 rounded-md text-xs font-extrabold uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 hover:brightness-110 transition"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          Conquistas
        </div>
        <span className="text-[11px] text-muted-foreground">
          {unlockedCount}/{totalCount} desbloqueadas
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {chip('all', 'Todas', totalCount)}
        {chip('in_progress', 'Em andamento', inProgressCount)}
        {chip('unlocked', 'Concluídas', unlockedCount)}
        {pendingClaimCount > 0 && (
          <button
            type="button"
            onClick={handleClaimAll}
            disabled={claimingAll}
            className={cn(
              'ml-auto px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border',
              'bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 border-amber-300',
              'shadow-[0_0_14px_-2px_hsl(38_95%_55%/0.7)] hover:brightness-110 transition',
              claimingAll && 'opacity-60 cursor-wait'
            )}
            title="Resgata todas as conquistas concluídas ainda não creditadas"
          >
            {claimingAll ? 'Resgatando…' : `🎁 Resgatar tudo (${pendingClaimCount})`}
          </button>
        )}
      </div>



      {/* Card expandido (inline, sem modal — fecha com X e volta ao Aura Match) */}
      {expanded && (() => {
        const Icon = ICON_MAP[expanded.icon] ?? Trophy;
        const style = ID_COLOR[expanded.id] ?? FALLBACK_STYLE;
        const remaining = Math.max(0, expanded.threshold - expanded.current);
        return (
          <div
            className={cn(
              'relative rounded-xl border p-3 animate-fade-in',
              style.bg,
              expanded.unlocked ? `border-transparent ring-2 ${style.ring}` : 'border-border/60'
            )}
          >
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setExpandedId(null)}
              className="absolute top-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/70 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-start gap-3 pr-7">
              <div className={cn('h-12 w-12 shrink-0 rounded-full flex items-center justify-center ring-2', style.ring, style.bg)}>
                <Icon className={cn('h-6 w-6', style.text)} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold">{expanded.title}</h3>
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider', style.text)}>
                    {TIER_LABEL[expanded.tier]}
                  </span>
                  {expanded.isPlatinum ? (
                    <span className="px-1.5 py-[1px] rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-cyan-200 via-slate-100 to-cyan-300 text-slate-900 shadow-[0_0_10px_-1px_hsl(190_90%_70%/0.9)]">
                      ◆ Platina
                    </span>
                  ) : expanded.isRare && (
                    <span className="px-1.5 py-[1px] rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-fuchsia-500 to-amber-400 text-white shadow-[0_0_8px_-1px_hsl(300_85%_60%/0.8)]">
                      ★ Rara
                    </span>
                  )}
                  {expanded.unlocked && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Desbloqueada
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{expanded.desc}</p>
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  <Sparkles className="h-3 w-3" /> Recompensa: +{expanded.xpReward.toLocaleString('pt-BR')} XP
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="tabular-nums font-semibold">
                    {Math.min(expanded.current, expanded.threshold)} / {expanded.threshold}
                  </span>
                  <span>
                    {expanded.unlocked
                      ? '🎉 Concluída'
                      : `Faltam ${remaining} para desbloquear`}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className={cn('h-full transition-all', style.bar)} style={{ width: `${expanded.progressPct}%` }} />
                </div>
                {expanded.unlocked && !expanded.claimed && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleClaim(expanded.id); }}
                    disabled={claimingId === expanded.id}
                    className={cn(
                      'mt-2 w-full py-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider',
                      'bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950',
                      'shadow-[0_0_14px_-2px_hsl(38_95%_55%/0.7)] hover:brightness-110 transition',
                      claimingId === expanded.id && 'opacity-60 cursor-wait'
                    )}
                  >
                    {claimingId === expanded.id ? 'Resgatando…' : `🎁 Resgatar +${expanded.xpReward.toLocaleString('pt-BR')} XP`}
                  </button>
                )}
                {expanded.claimed && (
                  <div className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    ✓ XP já creditado no seu saldo
                  </div>
                )}
                {expanded.isPlatinum && !expanded.claimed && rarePendingCount > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilter('rare_pending');
                      setExpandedId(null);
                      requestAnimationFrame(() => {
                        document.getElementById('aura-achievements-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      });
                    }}
                    className={cn(
                      'mt-2 w-full py-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider',
                      'bg-gradient-to-r from-fuchsia-500 to-amber-400 text-white',
                      'shadow-[0_0_12px_-2px_hsl(300_85%_60%/0.7)] hover:brightness-110 transition'
                    )}
                    title="Mostrar apenas conquistas RARAS ainda não resgatadas"
                  >
                    ★ Ver RARAS pendentes ({rarePendingCount})
                  </button>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      <AnimatePresence initial={false}>
        {filter === 'rare_pending' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 rounded-lg border border-fuchsia-400/50 bg-fuchsia-500/10 px-2.5 py-1.5">
              <span className="text-[11px] font-bold text-fuchsia-200">
                ★ Mostrando RARAS pendentes ({rarePendingCount})
              </span>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="text-[10px] font-semibold text-fuchsia-100 underline underline-offset-2 hover:text-white"
              >
                Limpar filtro
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      <motion.div id="aura-achievements-grid" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {visible.length === 0 && (
          <div className="col-span-full text-center text-[11px] text-muted-foreground py-4">
            {filter === 'unlocked' ? 'Nenhuma conquista concluída ainda.'
              : filter === 'rare_pending' ? 'Nenhuma conquista RARA pendente — você já resgatou todas! 🎉'
              : 'Nenhuma conquista nesse filtro.'}
          </div>
        )}
        {visible.map((a) => {

          const Icon = ICON_MAP[a.icon] ?? Trophy;
          const style = ID_COLOR[a.id] ?? FALLBACK_STYLE;
          const isExpanded = expandedId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : a.id)}
              aria-expanded={isExpanded}
              aria-label={`${a.title} — ${a.unlocked ? (a.claimed ? 'resgatada' : 'desbloqueada') : `${a.current}/${a.threshold}`}`}
              className={cn(
                'relative flex flex-col items-center text-center p-2 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-background',
                a.unlocked
                  ? cn(
                      // fundo sólido em contraste para diferenciar das em andamento
                      'bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-transparent',
                      'border-emerald-400/70 shadow-[0_0_18px_-6px_hsl(160_85%_55%/0.55)]'
                    )
                  : 'bg-background/40 border-border/40 opacity-80',
                isExpanded && `ring-2 ${style.ring}`
              )}
            >
              {a.unlocked && (
                <span
                  className={cn(
                    'absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded-full text-[8px] font-bold uppercase tracking-wider leading-none whitespace-nowrap z-10',
                    a.claimed
                      ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_8px_-1px_hsl(160_85%_55%/0.7)]'
                      : 'bg-amber-300 text-amber-950'
                  )}
                >
                  {a.claimed ? '✓ Resgatado' : 'Concluída'}
                </span>
              )}
              {a.isPlatinum ? (
                <span
                  className="absolute -top-1.5 right-1 px-1.5 py-[1px] rounded-full text-[8px] font-extrabold uppercase tracking-wider leading-none whitespace-nowrap z-10 bg-gradient-to-r from-cyan-200 via-slate-100 to-cyan-300 text-slate-900 shadow-[0_0_12px_-1px_hsl(190_90%_70%/0.9)] animate-pulse"
                  title="Conquista PLATINA — meta especial"
                >
                  ◆ PLATINA
                </span>
              ) : a.isRare && (
                <span
                  className="absolute -top-1.5 right-1 px-1.5 py-[1px] rounded-full text-[8px] font-extrabold uppercase tracking-wider leading-none whitespace-nowrap z-10 bg-gradient-to-r from-fuchsia-500 to-amber-400 text-white shadow-[0_0_10px_-1px_hsl(300_85%_60%/0.8)] animate-pulse"
                  title="Conquista Rara — recompensa de 10.000 XP"
                >
                  ★ RARA
                </span>
              )}
              <div
                className={cn(
                  'relative h-10 w-10 rounded-full flex items-center justify-center ring-2',
                  a.unlocked
                    ? 'ring-emerald-400 bg-emerald-500/30 shadow-[0_0_12px_-2px_hsl(160_85%_55%/0.7)]'
                    : cn('ring-muted', style.bg)
                )}
              >
                <Icon className={cn('h-5 w-5', a.unlocked ? 'text-emerald-200' : 'text-muted-foreground')} />
                {!a.unlocked && (
                  <Lock className="absolute -bottom-1 -right-1 h-3 w-3 text-muted-foreground bg-background rounded-full p-0.5" />
                )}
              </div>
              <p className={cn('mt-1 text-[10px] font-semibold leading-tight truncate w-full', a.unlocked ? 'text-emerald-100' : 'text-foreground/80')}>
                {a.title}
              </p>
              <span className={cn(
                'mt-0.5 text-[9px] font-bold tabular-nums leading-none',
                a.unlocked ? 'text-amber-200' : 'text-amber-300/60'
              )}>
                +{a.xpReward.toLocaleString('pt-BR')} XP
              </span>
              <div className="mt-1 w-full h-1 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full transition-all', a.unlocked ? 'bg-emerald-400' : 'bg-fuchsia-400/60')} style={{ width: `${a.progressPct}%` }} />
              </div>
              {a.unlocked && !a.claimed && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleClaim(a.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleClaim(a.id); } }}
                  className={cn(
                    'mt-1 inline-block w-full px-1 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider text-center cursor-pointer select-none',
                    'bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950',
                    'shadow-[0_0_10px_-2px_hsl(38_95%_55%/0.7)] hover:brightness-110 transition',
                    claimingId === a.id && 'opacity-60 cursor-wait pointer-events-none'
                  )}
                >
                  {claimingId === a.id ? '…' : 'Resgatar'}
                </span>
              )}
            </button>

          );
        })}
      </motion.div>

    </motion.div>
    </LayoutGroup>

  );
}
