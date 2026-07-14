import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuraDailyQuests } from '@/hooks/useAuraDailyQuests';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle2, Gift, Zap, Loader2, RefreshCw, HelpCircle, ArrowRight } from 'lucide-react';
import { AuraResetTimer } from './AuraResetTimer';
import { useResetReminder } from '@/hooks/useResetReminder';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { AuraXpGiftModal } from './AuraXpGiftModal';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { AURA_QUEST_EVENT } from '@/lib/auraQuests';

type QuestAction = { label: string; run: () => void };

/**
 * Painel compacto de missões diárias do Aura Match.
 * - "Saiba mais" explícito por missão (popover com guia + CTA "Ir agora").
 * - Realtime via canal Postgres em oculto_aura_daily_quests.
 * - Modal AuraXpGiftModal para a missão de presente (XP P2P).
 */
export function AuraDailyQuests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { quests, claim, labels, claimingKey, justClaimedKey, refresh, loading, lastReasons } = useAuraDailyQuests();
  useResetReminder();
  const [giftOpen, setGiftOpen] = useState(false);

  // Realtime: qualquer mudança em oculto_aura_daily_quests do usuário atualiza o quadro.
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable('oculto_aura_daily_quests', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.user_id !== user.id) return;
      refresh();
    });
    return () => { unsub(); };
  }, [user?.id, refresh]);


  if (!quests.length) return null;

  // Helpers de navegação/ação
  const goAuraMatch = () => navigate('/aura-match');
  const triggerRandomize = () => {
    navigate('/aura-match');
    // Em vez de auto-clicar, destacamos o botão para o usuário clicar e cumprir a missão.
    setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent('aura-action:randomize')); } catch {}
      const btn = document.querySelector<HTMLButtonElement>('[data-aura-action="randomize"]');
      btn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.info('Toque no botão amarelo destacado para randomizar sua aura', { duration: 4000 });
    }, 200);
  };
  const scrollToSelector = (selector: string, fallbackId?: string) => {
    const doScroll = () => {
      const el =
        document.querySelector(selector) ||
        (fallbackId ? document.getElementById(fallbackId) : null);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Pulso visual rápido para confirmar o destino
        (el as HTMLElement).classList.add('ring-2', 'ring-amber-400/70', 'rounded-xl');
        setTimeout(() => {
          (el as HTMLElement).classList.remove('ring-2', 'ring-amber-400/70', 'rounded-xl');
        }, 2200);
      }
    };
    if (window.location.pathname !== '/aura-match') {
      navigate('/aura-match');
      setTimeout(doScroll, 250);
    } else {
      doScroll();
    }
  };

  const actionByKey: Record<string, QuestAction> = {
    visit_aura:      { label: 'Abrir Aura Match',        run: goAuraMatch },
    tap_3_auras:     { label: 'Ir ao campo de auras',    run: () => scrollToSelector('[data-aura-bubbles]', 'aura-anchor-bubbles') },
    view_5_profiles: { label: 'Ir ao campo de auras',    run: () => scrollToSelector('[data-aura-bubbles]', 'aura-anchor-bubbles') },
    tap_rare_aura:   { label: 'Procurar aura rara',      run: () => scrollToSelector('[data-aura-bubbles]', 'aura-anchor-bubbles') },
    resonance_3:     { label: 'Ir ao campo de auras',    run: () => scrollToSelector('[data-aura-bubbles]', 'aura-anchor-bubbles') },
    send_echo:       { label: 'Ir ao campo de auras',    run: () => scrollToSelector('[data-aura-bubbles]', 'aura-anchor-bubbles') },
    send_super_dm:   { label: 'Ir ao campo de auras',    run: () => scrollToSelector('[data-aura-bubbles]', 'aura-anchor-bubbles') },
    visit_room:      { label: 'Ir às Salas de Energia',  run: () => scrollToSelector('[data-aura-rooms]', 'aura-anchor-rooms') },
    send_3_dms:      { label: 'Abrir Mensagens',         run: () => navigate('/messages') },
    join_storm:      { label: 'Ir ao banner de Tempestade', run: () => {
      const go = () => {
        const el = document.querySelector('[data-aura-storm]') || document.getElementById('aura-anchor-storm');
        const hasActive = el && el.querySelector('[role="status"]'); // o banner só renderiza quando há storm
        if (hasActive) {
          (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
          toast.success('Tempestade ativa! Continue no Aura Match — a missão será concluída automaticamente.', { duration: 4000 });
        } else {
          toast.info('Nenhuma Tempestade ativa agora. Fique no Aura Match — a missão completa sozinha assim que uma começar.', { duration: 5000 });
        }
      };
      if (window.location.pathname !== '/aura-match') {
        navigate('/aura-match');
        setTimeout(go, 350);
      } else {
        go();
      }
    } },

    randomize_aura:      { label: 'Randomizar agora',         run: triggerRandomize },
    send_gift:           { label: 'Escolher destinatário',    run: () => setGiftOpen(true) },
    visit_notifications: { label: 'Abrir Notificações',       run: () => navigate('/notifications') },
    visit_vitrine_vip:   { label: 'Abrir Vitrine VIP',        run: () => navigate('/vitrine-vip') },
    visit_canal_vip:     { label: 'Abrir Canal VIP',          run: () => navigate('/canal-vip') },
    follow_profile:      { label: 'Ir ao campo de auras',     run: () => scrollToSelector('[data-aura-bubbles]', 'aura-anchor-bubbles') },
    like_post:           { label: 'Abrir o feed',             run: () => navigate('/feed') },
    save_post:           { label: 'Abrir o feed',             run: () => navigate('/feed') },
    vote_poll:           { label: 'Abrir o feed',             run: () => navigate('/feed') },
    comment_post:        { label: 'Abrir o feed',             run: () => navigate('/feed') },
  };

  return (
    <div className="rounded-xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/8 to-emerald-600/5 p-3 space-y-2 shadow-[0_0_24px_-12px_hsl(150_70%_45%/0.45)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          Missões diárias
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={async () => {
              try { await refresh(); toast.success('Missões atualizadas'); }
              catch { toast.error('Erro ao atualizar missões'); }
            }}
            disabled={loading}
            aria-label="Atualizar missões"
            className="inline-flex h-6 items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2 text-[10px] font-medium text-muted-foreground hover:text-amber-300 hover:border-amber-400/40 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Atualizar
          </button>
          <AuraResetTimer compact />
        </div>
      </div>

      <ul className="space-y-1.5">
        {quests.map((q) => {
          const meta = labels[q.quest_key] ?? { title: q.quest_key, desc: '', steps: [] as string[] };
          const action = actionByKey[q.quest_key];
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          const ready = q.progress >= q.target && !q.claimed;
          const isClaiming = claimingKey === q.quest_key;
          const justClaimed = justClaimedKey === q.quest_key;
          return (
            <li
              key={q.quest_key}
              className={cn(
                'rounded-lg bg-background/40 p-2 transition-colors',
                justClaimed && 'ring-1 ring-emerald-400/60 bg-emerald-500/10 animate-fade-in'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">{meta.title}</p>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 shrink-0">
                      <Zap className="h-2.5 w-2.5" /> +{q.xp_reward} XP
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{meta.desc}</p>
                </div>
                {q.claimed ? (
                  <CheckCircle2 className={cn('h-5 w-5 text-emerald-500 shrink-0', justClaimed && 'animate-fade-in')} />
                ) : ready ? (
                  <Button
                    size="sm"
                    disabled={isClaiming}
                    className="h-7 px-2 text-xs gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-95"
                    onClick={() => claim(q.quest_key)}
                  >
                    {isClaiming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gift className="h-3 w-3" />}
                    {isClaiming ? '...' : 'Resgatar'}
                  </Button>
                ) : (
                  <span className="text-[11px] font-medium text-amber-300 shrink-0 tabular-nums">
                    {q.progress}/{q.target}
                  </span>
                )}
              </div>

              <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    q.claimed ? 'bg-emerald-500' : ready ? 'bg-amber-300' : 'bg-amber-400/70'
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Linha inferior: "Saiba mais" (guia numerado) + CTA "Ir agora" */}
              {((meta.steps && meta.steps.length) || action) && !q.claimed && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {meta.steps && meta.steps.length ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-amber-300 transition-colors"
                        >
                          <HelpCircle className="h-3 w-3" />
                          Saiba mais
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" className="w-80 text-xs leading-relaxed space-y-2">
                        <p className="font-semibold text-amber-300">Como completar — passo a passo</p>
                        <ol className="space-y-1.5 list-none">
                          {meta.steps.map((s, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="shrink-0 h-4 w-4 rounded-full bg-amber-400/15 text-amber-300 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                              <span className="text-muted-foreground">{s}</span>
                            </li>
                          ))}
                        </ol>
                        {action && (
                          <Button
                            size="sm"
                            className="w-full h-8 text-xs gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-95"
                            onClick={action.run}
                          >
                            {action.label}
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                      </PopoverContent>
                    </Popover>
                  ) : <span />}
                  {action && (
                    <button
                      type="button"
                      onClick={action.run}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200 transition-colors"
                    >
                      {action.label}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              {lastReasons?.[q.quest_key] && Date.now() - lastReasons[q.quest_key].at < 60_000 && (
                <p className="mt-1 text-[10px] text-emerald-300/80 truncate" title={lastReasons[q.quest_key].reason}>
                  ✓ {lastReasons[q.quest_key].reason}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <AuraXpGiftModal open={giftOpen} onOpenChange={setGiftOpen} />
    </div>
  );
}
