/**
 * MiningSidePanel — Painel exclusivo da Sala Mineração.
 *
 * Renderiza 3 blocos compactos, em tempo real:
 *   1) Progresso de XP (xp atual + barra até o próximo nível).
 *   2) Avisos de regras bloqueadas (anti-bot/rate-limit), com motivo e
 *      countdown até poder pontuar novamente.
 *   3) Ledger recente (últimas 8 entradas do oculto_aura_room_mining_ledger
 *      do usuário) — atualiza ao vivo via postgres_changes INSERT.
 *
 * Performance (Realme C55 e similares): sem heavy shadows, sem animações
 * caras; subscriptions visibility-aware e desligadas quando hidden.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pickaxe, AlertTriangle, History, TrendingUp, Clock3, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuraProgress } from '@/hooks/useAuraProgress';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { SyncStatusDot } from './SyncStatusDot';

interface Props {
  slug: string;
}

interface BlockState {
  reason: string;
  at: number;
  cooldownUntil: number | null;
  message: string | null;
}

interface LedgerRow {
  id: string;
  rule_key: string;
  amount: number;
  created_at: string;
  meta: { msg?: string } | null;
}

const REASON_COPY: Record<string, { title: string; tip: string }> = {
  rate_limited:      { title: 'Aguarde para pontuar novamente', tip: 'Limite anti-flood: 1 XP de mensagem a cada 20s.' },
  msg_too_short:     { title: 'Mensagem muito curta',         tip: 'Use pelo menos 12 caracteres e 3 palavras distintas.' },
  msg_low_diversity: { title: 'Pouca diversidade de palavras',tip: 'Evite repetir a mesma palavra; escreva uma ideia completa.' },
  msg_blacklisted:   { title: 'Mensagem genérica demais',     tip: '"oi", "hahaha", "kkk" não contam. Diga algo de verdade.' },
  msg_repetitive:    { title: 'Mensagem muito parecida com a anterior', tip: 'Aguarde alguns minutos ou escreva algo diferente.' },
};

const RULE_LABEL: Record<string, string> = {
  per_minute_idle:     'Tempo em sala',
  per_quality_message: 'Mensagem',
  receive_pulse:       'Pulso recebido',
  receive_highlight:   'Destaque recebido',
  invite_accepted:     'Convite aceito',
  approach:            'Aproximação',
  receive_reaction:    'Reação recebida',
  receive_like:        'Like recebido',
  receive_dislike:     'Dislike recebido',
  reply_mention:       'Resposta/menção',
};

function timeShort(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  return `${Math.floor(diff / 3_600_000)}h`;
}

export function MiningSidePanel({ slug }: Props) {
  const { user } = useAuth();
  const { progress } = useAuraProgress(false);
  const [block, setBlock] = useState<BlockState | null>(null);
  const [secsLeft, setSecsLeft] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [progressSync, setProgressSync] = useState<number | null>(null);
  const [ledgerSync, setLedgerSync] = useState<number | null>(null);
  const prevXpRef = useRef<number | null>(null);
  const [progressOpen, setProgressOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('mining:progressOpen') === '1';
  });
  const [historyOpen, setHistoryOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('mining:historyOpen') === '1';
  });
  useEffect(() => {
    try { window.localStorage.setItem('mining:progressOpen', progressOpen ? '1' : '0'); } catch {}
  }, [progressOpen]);
  useEffect(() => {
    try { window.localStorage.setItem('mining:historyOpen', historyOpen ? '1' : '0'); } catch {}
  }, [historyOpen]);

  // --- Avisos de regras bloqueadas (escuta evento global de useMiningRoom)
  useEffect(() => {
    const onBlock = (e: Event) => {
      const d = (e as CustomEvent<BlockState & { slug?: string }>).detail;
      if (!d || (d.slug && d.slug !== slug)) return;
      setBlock(d);
    };
    window.addEventListener('MINING_RULE_BLOCKED', onBlock as EventListener);
    return () => window.removeEventListener('MINING_RULE_BLOCKED', onBlock as EventListener);
  }, [slug]);

  // Countdown do bloqueio
  useEffect(() => {
    if (!block?.cooldownUntil) { setSecsLeft(0); return; }
    const tick = () => {
      const ms = Math.max(0, (block.cooldownUntil ?? 0) - Date.now());
      setSecsLeft(Math.ceil(ms / 1000));
      if (ms <= 0) setBlock(null);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [block]);

  // --- Marca sincronização do progresso sempre que o saldo de XP mudar.
  useEffect(() => {
    if (prevXpRef.current === null) { prevXpRef.current = progress.xp; return; }
    if (prevXpRef.current !== progress.xp) {
      prevXpRef.current = progress.xp;
      setProgressSync(Date.now());
    }
  }, [progress.xp]);

  // --- Ledger inicial + realtime
  useEffect(() => {
    if (!user?.id || !slug) return;
    let mounted = true;
    (async () => {
      const { data } = await (supabase as any)
        .from('oculto_aura_room_mining_ledger')
        .select('id, rule_key, amount, created_at, meta')
        .eq('user_id', user.id)
        .eq('slug', slug)
        .order('created_at', { ascending: false })
        .limit(8);
      if (mounted && Array.isArray(data)) {
        setRows(data as LedgerRow[]);
        if (data.length > 0) setLedgerSync(Date.now());
      }
    })();

    const unsub = subscribeTable('oculto_aura_room_mining_ledger', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const r = payload?.new as LedgerRow | undefined;
      if (!r || (r as any).user_id !== user.id) return;
      if (!r || (r as any).slug !== slug) return;
      setRows((prev) => [r, ...prev].slice(0, 8));
      setLedgerSync(Date.now());
    }, { events: ['INSERT'] });

    return () => { mounted = false; unsub(); };
  }, [user?.id, slug]);


  const pct = useMemo(() => {
    const total = (progress.xp_in_level || 0) + (progress.xp_to_next || 1);
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((progress.xp_in_level || 0) / total) * 100)));
  }, [progress.xp_in_level, progress.xp_to_next]);

  return (
    <aside className="flex flex-col gap-2 rounded-xl border border-amber-400/25 bg-black/30 p-2 text-foreground/90">
      {/* 1) Progresso (recolhível para priorizar o histórico do chat) */}
      <section>
        <button
          type="button"
          onClick={() => setProgressOpen((v) => !v)}
          aria-expanded={progressOpen}
          aria-controls="mining-progress-body"
          className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-[10px] uppercase tracking-wider text-foreground/70 hover:bg-white/[0.04]"
        >
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-amber-300" /> Progresso
          </span>
          <span className="inline-flex items-center gap-1.5">
            {!progressOpen && (
              <span className="tabular-nums text-amber-200">
                {progress.xp.toLocaleString('pt-BR')} XP
              </span>
            )}
            <SyncStatusDot lastUpdate={progressSync} label="Progresso" />
            <span className="tabular-nums text-amber-300">Nv {progress.level}</span>
            {progressOpen
              ? <ChevronUp className="h-3 w-3 text-foreground/60" aria-hidden />
              : <ChevronDown className="h-3 w-3 text-foreground/60" aria-hidden />}
          </span>
        </button>
        {progressOpen && (
          <div id="mining-progress-body">
            <div className="mt-1 flex items-baseline gap-1 text-xs">
              <Pickaxe className="h-3 w-3 text-amber-300" />
              <span className="font-bold tabular-nums text-amber-200">{progress.xp.toLocaleString('pt-BR')}</span>
              <span className="text-[10px] text-foreground/60">XP total</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-0.5 flex items-center justify-between text-[9px] text-foreground/60 tabular-nums">
              <span>{progress.xp_in_level} / {(progress.xp_in_level + progress.xp_to_next) || 0}</span>
              <span>Faltam {progress.xp_to_next} XP p/ Nv {progress.level + 1}</span>
            </div>
          </div>
        )}
      </section>

      {/* 2) Aviso de bloqueio */}
      {block && (
        <section
          role="status"
          className="rounded-md border border-amber-400/40 bg-amber-500/[0.08] px-2 py-1.5"
        >
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-amber-200">
                {REASON_COPY[block.reason]?.title ?? 'Mensagem não pontuou'}
              </div>
              <div className="text-[10px] leading-snug text-foreground/75">
                {REASON_COPY[block.reason]?.tip ?? 'Tente algo diferente.'}
              </div>
              {secsLeft > 0 && (
                <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] tabular-nums text-amber-300">
                  <Clock3 className="h-3 w-3" /> Pontua de novo em {secsLeft}s
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setBlock(null)}
              aria-label="Dispensar aviso"
              className="text-[10px] text-foreground/50 hover:text-foreground/90"
            >×</button>
          </div>
        </section>
      )}

      {/* 3) Histórico recente (recolhível para priorizar o chat) */}
      <section>
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
          aria-controls="mining-history-body"
          className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-[10px] uppercase tracking-wider text-foreground/70 hover:bg-white/[0.04]"
        >
          <span className="inline-flex items-center gap-1">
            <History className="h-3 w-3 text-amber-300" /> Histórico recente
            {!historyOpen && rows.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-400/15 px-1.5 py-[1px] text-[9px] tabular-nums text-amber-200">
                {rows.length}
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <SyncStatusDot lastUpdate={ledgerSync} label="Histórico" />
            {historyOpen
              ? <ChevronUp className="h-3 w-3 text-foreground/60" aria-hidden />
              : <ChevronDown className="h-3 w-3 text-foreground/60" aria-hidden />}
          </span>
        </button>
        {historyOpen && (
          <div id="mining-history-body" className="mt-1">
            {rows.length === 0 ? (
              <p className="rounded-md bg-white/[0.03] px-2 py-2 text-[10px] text-foreground/60">
                Permaneça na sala e converse de verdade — seu XP minerado aparece aqui em tempo real.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {rows.map((r) => {
                  const positive = r.amount > 0;
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-1 rounded-md bg-white/[0.03] px-1.5 py-1 text-[10.5px]"
                    >
                      <span className="min-w-0 flex-1 truncate text-foreground/85">
                        {RULE_LABEL[r.rule_key] ?? r.rule_key}
                        {r.meta?.msg && (
                          <span className="ml-1 text-foreground/50">“{r.meta.msg.slice(0, 24)}{r.meta.msg.length > 24 ? '…' : ''}”</span>
                        )}
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {positive ? '+' : ''}{r.amount} XP
                      </span>
                      <span className="shrink-0 text-[9px] tabular-nums text-foreground/50">{timeShort(r.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}
