/**
 * Painel de conquistas da comunidade — mostra defs (bloqueadas/ganhas)
 * e progresso da conta atual. Performance-first (sem libs pesadas).
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  Award, Sparkles, PenLine, Megaphone, MessageCircle, MessagesSquare,
  Heart, Flame, CalendarCheck, ShieldCheck, Lock, Loader2, RefreshCw,
} from 'lucide-react';
import { useCommunityBadges, useEvaluateCommunityBadges } from '@/hooks/useCommunities';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, PenLine, Megaphone, MessageCircle, MessagesSquare,
  Heart, Flame, CalendarCheck, ShieldCheck, Award,
};

interface Props { communityId: string; userId?: string }

export function CommunityBadgesPanel({ communityId, userId }: Props) {
  const { data, isLoading } = useCommunityBadges(communityId, userId);
  const evaluate = useEvaluateCommunityBadges();

  // Avalia automaticamente ao abrir a aba — necessário para retroagir
  // tópicos/respostas/reações criados antes dos triggers existirem.
  const autoEvalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!communityId) return;
    const key = `${communityId}:${userId ?? 'self'}`;
    if (autoEvalRef.current === key) return;
    autoEvalRef.current = key;
    evaluate.mutate({ communityId, userId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, userId]);

  const earnedMap = useMemo(() => {
    const m = new Map<string, string>();
    (data?.earned || []).forEach((e) => m.set(e.badge_code, e.granted_at));
    return m;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const defs = data?.defs || [];
  const earnedCount = data?.earned.length || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Award className="h-4 w-4 text-amber-400" /> Conquistas
          </p>
          <p className="text-[11px] text-muted-foreground">
            {earnedCount} de {defs.length} desbloqueadas
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => evaluate.mutate({ communityId, userId })}
          disabled={evaluate.isPending}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${evaluate.isPending ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {defs.map((def) => {
          const Icon = ICONS[def.icon] || Award;
          const earnedAt = earnedMap.get(def.code);
          const earned = !!earnedAt;
          return (
            <div
              key={def.code}
              className={`relative rounded-xl border p-3 transition-colors ${
                earned
                  ? 'border-border bg-card'
                  : 'border-border/60 bg-muted/20 opacity-70'
              }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: earned ? `${def.color}22` : 'hsl(var(--muted))',
                    color: earned ? def.color : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {earned ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{def.name}</p>
                  {def.description && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                      {def.description}
                    </p>
                  )}
                  {earned && earnedAt && (
                    <p className="text-[10px] text-emerald-400 mt-1">
                      ✓ {formatDistanceToNow(new Date(earnedAt), { addSuffix: true, locale: ptBR })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {defs.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">
          Nenhuma conquista configurada.
        </p>
      )}
    </div>
  );
}
