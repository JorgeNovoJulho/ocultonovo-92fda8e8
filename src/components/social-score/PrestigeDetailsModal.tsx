import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Eye, Flame, Crown, Gem, Star, Gift, X, Loader2, Percent, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { usePrestige, usePrestigeLevels } from '@/hooks/usePrestige';
import { supabase } from '@/lib/supabaseExternal';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles, eye: Eye, flame: Flame, crown: Crown, gem: Gem, star: Star,
};

interface HistoryItem {
  rank: number; name: string; badge_icon: string; glow_color: string;
  xp_at: number; reached_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  showHistory?: boolean;
}

/** Renderiza o label correto para cada tipo de recompensa, descartando valores 0/false. */
function formatReward(kind: string, raw: unknown): string | null {
  // Coerce numérico quando aplicável
  const num = typeof raw === 'number' ? raw : Number(raw);
  const isNum = Number.isFinite(num);

  switch (kind) {
    case 'discount_sub':
      if (!isNum || num <= 0) return null;
      return `${num}% de desconto na assinatura`;
    case 'discount_vip':
      if (!isNum || num <= 0) return null;
      return `${num}% de desconto em conteúdo VIP`;
    case 'discount_fee':
      if (!isNum || num <= 0) return null;
      return `${num}% de desconto na taxa da plataforma`;
    case 'boost_radar':
      if (!isNum || num <= 1) return null;
      return `Boost no Radar (×${num})`;
    case 'boost_aura':
      if (!isNum || num <= 1) return null;
      return `Boost no Aura Match (×${num})`;
    case 'highlight':
      return raw ? 'Destaque visual no perfil' : null;
    default: {
      // genérico: se for número 0/false, esconde
      if (raw === false || raw === 0 || raw === '' || raw == null) return null;
      return `${kind}: ${String(raw)}`;
    }
  }
}

function RewardGroup({
  title, icon: Icon, items,
}: { title: string; icon: React.ComponentType<{ className?: string }>; items: Array<[string, string]> }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{title}</span>
        <span className="ml-auto rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums shrink-0">
          {items.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map(([k, label]) => (
          <li
            key={k}
            className="text-xs flex items-start gap-2 rounded-md border border-border/40 bg-muted/30 px-2 py-1.5"
          >
            <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1 break-words leading-snug">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PrestigeDetailsModal({ open, onClose, userId, showHistory = true }: Props) {
  const { data, loading } = usePrestige(userId);
  const { levels } = usePrestigeLevels();
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    if (!open || !showHistory) return;
    let cancel = false;
    (async () => {
      const { data: rows } = await (supabase as any).rpc('social_prestige_history', { p_user: userId ?? null });
      if (!cancel) setHistory(Array.isArray(rows) ? (rows as HistoryItem[]) : []);
    })();
    return () => { cancel = true; };
  }, [open, userId, showHistory]);

  // Sempre renderiza o Dialog quando open=true; mostra skeleton enquanto carrega
  const Icon = data ? (ICONS[data.badge_icon] ?? Sparkles) : Sparkles;
  const glowColor = data?.glow_color ?? '270 70% 60%';
  const glow = `hsl(${glowColor})`;

  // Sanitiza progresso para 0-100 (defensivo contra string/NaN)
  const progressPct = data
    ? Math.max(0, Math.min(100, Number(data.progress_pct) || 0))
    : 0;

  // Agrupa recompensas em Descontos / Boosts / Outros, com ordem estável
  const REWARD_ORDER = ['discount_sub', 'discount_vip', 'discount_fee', 'boost_radar', 'boost_aura', 'highlight'];
  const rewardGroups = useMemo(() => {
    const groups = { discount: [] as Array<[string, string]>, boost: [] as Array<[string, string]>, other: [] as Array<[string, string]> };
    if (!data?.rewards) return groups;
    const entries = Object.entries(data.rewards)
      .map(([k, v]) => [k, formatReward(k, v)] as const)
      .filter((e): e is readonly [string, string] => e[1] !== null)
      .sort((a, b) => {
        const ai = REWARD_ORDER.indexOf(a[0]); const bi = REWARD_ORDER.indexOf(b[0]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    for (const [k, label] of entries) {
      if (k.startsWith('discount_')) groups.discount.push([k, label]);
      else if (k.startsWith('boost_')) groups.boost.push([k, label]);
      else groups.other.push([k, label]);
    }
    return groups;
  }, [data?.rewards]);

  const totalRewards = rewardGroups.discount.length + rewardGroups.boost.length + rewardGroups.other.length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span
              className="grid place-items-center h-8 w-8 rounded-full shrink-0"
              style={{ background: `hsl(${glowColor} / 0.22)`, color: glow }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate min-w-0">Prestígio Social</span>
          </DialogTitle>
        </DialogHeader>

        {!data ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loading ? 'Carregando seu prestígio…' : 'Sem dados de prestígio.'}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tier atual */}
            <div
              className="rounded-xl border p-3"
              style={{
                background: `linear-gradient(135deg, hsl(${glowColor} / 0.16), hsl(${glowColor} / 0.03))`,
                borderColor: `hsl(${glowColor} / 0.5)`,
              }}
            >
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Nível atual
              </div>
              <div className="font-semibold text-base sm:text-lg leading-tight break-words" style={{ color: glow }}>
                {data.name}
              </div>
              {data.description && (
                <div className="text-xs text-muted-foreground mt-1 break-words">{data.description}</div>
              )}

              <div className="mt-3">
                <Progress value={progressPct} className="h-1.5" />
                <div className="flex flex-col gap-0.5 mt-1.5 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span className="shrink-0 tabular-nums">{data.xp} pts</span>
                  <span className="sm:text-right break-words leading-tight">
                    {data.next_name ? (
                      <>
                        Faltam{' '}
                        <strong className="text-foreground/80 tabular-nums">{data.xp_to_next}</strong>{' '}
                        pts para{' '}
                        <strong className="text-foreground/80">{data.next_name}</strong>
                      </>
                    ) : (
                      <>Nível máximo alcançado</>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Recompensas agrupadas */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Gift className="h-3.5 w-3.5" /> Recompensas deste nível
              </div>
              {totalRewards === 0 ? (
                <div className="text-xs text-muted-foreground italic px-1">
                  Sem recompensas neste nível. Suba para o próximo para desbloquear benefícios.
                </div>
              ) : (
                <div className="space-y-3">
                  <RewardGroup title="Descontos" icon={Percent} items={rewardGroups.discount} />
                  <RewardGroup title="Boosts" icon={Zap} items={rewardGroups.boost} />
                  <RewardGroup title="Outros" icon={Sparkles} items={rewardGroups.other} />
                </div>
              )}
            </div>


            {/* Trilha de tiers */}
            {levels.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Todos os níveis
                </div>
                <ul className="space-y-1">
                  {levels.map((l) => {
                    const I = ICONS[l.badge_icon] ?? Sparkles;
                    const reached = data.xp >= l.min_xp;
                    const current = l.rank === data.rank;
                    return (
                      <li
                        key={l.id}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs border',
                          current ? 'border-primary/50 bg-primary/5' : 'border-border/40',
                          !reached && 'opacity-50',
                        )}
                      >
                        <I
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: `hsl(${l.glow_color})` }}
                        />
                        <span className="font-medium min-w-0 flex-1 truncate">{l.name}</span>
                        <span className="text-muted-foreground shrink-0">
                          {l.min_xp}+ pts
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Histórico */}
            {showHistory && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Sua jornada
                </div>
                {history === null ? (
                  <div className="h-12 rounded-md bg-muted/40 animate-pulse" />
                ) : history.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">
                    Nenhum marco registrado ainda.
                  </div>
                ) : (
                  <ol className="space-y-1.5 border-l border-border/50 pl-3">
                    {history.map((h) => {
                      const I = ICONS[h.badge_icon] ?? Sparkles;
                      return (
                        <li key={h.rank} className="text-xs flex items-center gap-2">
                          <I
                            className="h-3 w-3 shrink-0"
                            style={{ color: `hsl(${h.glow_color})` }}
                          />
                          <span className="font-medium min-w-0 flex-1 truncate">
                            {h.name}
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {new Date(h.reached_at).toLocaleDateString('pt-BR', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}

            <Button variant="outline" size="sm" onClick={onClose} className="w-full">
              <X className="h-3.5 w-3.5 mr-1" /> Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

