import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Gift, Crown, MessageCircle, MapPin, Zap, Trophy, RefreshCw,
  Send, Wifi, WifiOff, CheckCircle2, Sparkles, Heart, Star,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  useAuraGiftsReceived,
  useAuraGiftsRanking,
  useAuraGiftsGlobalRanking,
  useAuraGiftsSent,
  useMarkAuraGiftsSeen,
  useRefreshAuraGifts,
  useAuraGiftsRealtime,
  useThankedGifts,
  type AuraGiftRow,
  type AuraGiftRankRow,
  type AuraGiftSentRow,
} from '@/hooks/useAuraGifts';
import { useAuth } from '@/hooks/useAuth';
import { useSocialCore } from '@/social-universe/core/useSocialCore';
import { getOrCreateConversationId } from '@/lib/conversationsApi';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { cn } from '@/lib/utils';
import { getPublicHandle, getHandleInitial } from '@/lib/userHandle';

const THANKS_MSG = '🎁❤️😘 Muito obrigado(a) pelo seu presente de XP! Você fez meu dia! 💝';
const PAGE_SIZE = 15;

function genderLabel(t?: string | null) {
  switch ((t || '').toLowerCase()) {
    case 'male': return 'Homem';
    case 'female': return 'Mulher';
    case 'couple': return 'Casal';
    case 'trans': return 'Trans';
    default: return null;
  }
}

type TabKey = 'received' | 'sent' | 'ranking';
type SortKey = 'recent' | 'xp';

/** Saldo total de XP Aura do usuário logado, com realtime via gifts. */
function useMyAuraXp() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const KEY = ['my-aura-xp', user?.id];

  const q = useQuery({
    queryKey: KEY,
    enabled: !!user?.id,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<number> => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('aura_xp')
        .or(`user_id.eq.${user!.id},id.eq.${user!.id}`)
        .limit(1)
        .maybeSingle();
      return Number(data?.aura_xp ?? 0);
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const unsubGifts = subscribeTable('oculto_aura_xp_gifts', () => {
      qc.invalidateQueries({ queryKey: KEY });
    });
    const unsubProfiles = subscribeTable('profiles', (payload: any) => {
      const row = payload?.new ?? {};
      if (row.user_id === user.id || row.id === user.id) {
        qc.invalidateQueries({ queryKey: KEY });
      }
    }, { events: ['UPDATE'] });
    return () => { unsubGifts(); unsubProfiles(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return q;
}

export default function MyGiftsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('received');
  const received = useAuraGiftsReceived();
  const sent = useAuraGiftsSent();
  const ranking = useAuraGiftsRanking();
  const globalRanking = useAuraGiftsGlobalRanking(20);
  const [rankScope, setRankScope] = useState<'fans' | 'global'>('fans');
  const markSeen = useMarkAuraGiftsSeen();
  const { status, lastUpdatedAt, refresh } = useAuraGiftsRealtime();
  const { thanked, markThanked } = useThankedGifts();
  const myAuraXp = useMyAuraXp();
  const socialCore = useSocialCore();

  useEffect(() => {
    if (tab !== 'received' || !received.data?.length) return;
    const t = setTimeout(() => markSeen.mutate(), 2000);
    return () => clearTimeout(t);
  }, [tab, received.data, markSeen]);

  const [thankingId, setThankingId] = useState<string | null>(null);
  const [bulkThanking, setBulkThanking] = useState(false);
  const refreshGifts = useRefreshAuraGifts();
  const isRefreshing =
    received.isFetching || ranking.isFetching || sent.isFetching || myAuraXp.isFetching;

  const handleRefresh = () => {
    refreshGifts();
    refresh();
    toast.success('Lista atualizada.');
  };

  /** Envia um agradecimento. Se `silent` for true, não navega nem dispara toast individual. */
  const thankOne = async (
    senderAuthId: string | null | undefined,
    giftId: string | undefined,
    opts: { silent?: boolean } = {},
  ): Promise<boolean> => {
    if (!user?.id || !senderAuthId) return false;
    const { id: conversationId, error } = await getOrCreateConversationId(user.id, senderAuthId);
    if (error || !conversationId) return false;
    try {
      await (supabase as any).from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: THANKS_MSG,
      });
    } catch {
      if (!opts.silent) toast.error('Conversa aberta, mas não foi possível enviar a mensagem.');
      return false;
    }
    if (giftId) {
      markThanked(giftId);
      try {
        await (supabase as any)
          .from('oculto_aura_xp_gifts')
          .update({ thanked_at: new Date().toISOString() })
          .eq('id', giftId);
      } catch {/* silencioso */}
    }
    if (!opts.silent) {
      refreshGifts();
      refresh();
      toast.success('Agradecimento enviado! 🎁');
      navigate(`/messages?conversation=${conversationId}`);
    }
    return true;
  };

  const handleThank = async (
    senderAuthId: string | null | undefined,
    giftId?: string,
  ) => {
    if (thankingId || bulkThanking) return;
    if (!user?.id || !senderAuthId) {
      toast.error('Não foi possível identificar o remetente.');
      return;
    }
    setThankingId(senderAuthId);
    try {
      await thankOne(senderAuthId, giftId);
    } finally {
      setThankingId(null);
    }
  };

  const handleBulkThank = async (
    items: { senderAuthId: string | null | undefined; giftId: string }[],
  ) => {
    if (bulkThanking || items.length === 0) return;
    setBulkThanking(true);
    let ok = 0;
    let fail = 0;
    const tId = toast.loading(`Enviando ${items.length} agradecimentos…`);
    try {
      for (const it of items) {
        const success = await thankOne(it.senderAuthId, it.giftId, { silent: true });
        if (success) ok++; else fail++;
      }
      refreshGifts();
      refresh();
      toast.dismiss(tId);
      if (ok > 0) toast.success(`${ok} agradecimento${ok > 1 ? 's' : ''} enviado${ok > 1 ? 's' : ''}! 🎁`);
      if (fail > 0) toast.error(`${fail} falhou${fail > 1 ? 'ram' : ''} — tente novamente.`);
    } finally {
      setBulkThanking(false);
    }
  };


  const totalReceived = useMemo(
    () => (received.data ?? []).reduce((acc, r) => acc + (r.amount || 0), 0),
    [received.data],
  );
  const totalCount = received.data?.length ?? 0;

  const totalSent = useMemo(
    () => (sent.data ?? []).reduce((acc, r) => acc + (r.amount || 0), 0),
    [sent.data],
  );
  const totalSentCount = sent.data?.length ?? 0;

  const auraXp = myAuraXp.data ?? 0;
  const auraLevel = socialCore.data?.aura?.level ?? null;
  const socialLevel = socialCore.data?.score?.level ?? null;
  const socialLevelName = socialCore.data?.score?.level_name ?? null;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 pb-28 md:pb-10">
      {/* HERO: Saldo XP + Níveis */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent p-4 md:p-5 mb-4">
        <div className="absolute -top-10 -right-10 opacity-10 pointer-events-none">
          <Sparkles className="h-40 w-40 text-amber-400" />
        </div>
        <div className="relative flex flex-col items-start gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-amber-500/20">
              <Gift className="h-6 w-6 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-foreground leading-tight text-left">
                Meus Presentes
              </h1>
              <p className="text-xs text-muted-foreground text-left">
                XP recebidos, enviados e quem mais te apoia
              </p>
            </div>
          </div>

          <TooltipProvider delayDuration={150}>
            <div className="flex items-center gap-1.5 flex-wrap justify-start w-full">
              {/* Saldo de XP — DESTAQUE (compacto) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-md shadow-amber-500/20 whitespace-nowrap"
                  >
                    <Zap className="h-3 w-3 shrink-0" />
                    <div className="leading-tight text-left">
                      <div className="text-[8px] font-bold uppercase tracking-wider opacity-80">
                        XP Aura
                      </div>
                      <div className="text-xs font-extrabold tabular-nums">
                        {myAuraXp.isLoading ? '…' : auraXp.toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-[260px] text-xs">
                  <p className="font-semibold mb-1">XP Aura</p>
                  <p className="text-muted-foreground">
                    Saldo total de XP recebidos como presentes de outros usuários e em salas ao vivo do Aura Match. Cada presente soma XP ao seu perfil e impulsiona seu nível.
                  </p>
                </TooltipContent>
              </Tooltip>

              {/* Aura Match Level */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-pink-500/20 dark:bg-pink-500/15 border border-pink-500/40 dark:border-pink-500/30 whitespace-nowrap"
                  >
                    <Heart className="h-2.5 w-2.5 text-pink-600 dark:text-pink-400 shrink-0" />
                    <div className="leading-tight text-left">
                      <div className="text-[8px] font-bold uppercase tracking-wider text-pink-800 dark:text-pink-300/80">
                        Aura Match
                      </div>
                      <div className="text-[11px] font-bold text-pink-900 dark:text-pink-100">
                        Nv {auraLevel ?? '—'}
                      </div>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-[260px] text-xs">
                  <p className="font-semibold mb-1">Nível Aura Match</p>
                  <p className="text-muted-foreground">
                    Mede sua presença afetiva: matches realizados, conversas iniciadas e presentes trocados. Sobe automaticamente conforme você interage e recebe XP em conexões.
                  </p>
                </TooltipContent>
              </Tooltip>

              {/* Social Level */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-violet-500/20 dark:bg-violet-500/15 border border-violet-500/40 dark:border-violet-500/30 whitespace-nowrap max-w-full"
                  >
                    <Star className="h-2.5 w-2.5 text-violet-600 dark:text-violet-300 shrink-0" />
                    <div className="leading-tight text-left min-w-0">
                      <div className="text-[8px] font-bold uppercase tracking-wider text-violet-800 dark:text-violet-300/80">
                        Social
                      </div>
                      <div className="text-[11px] font-bold text-violet-900 dark:text-violet-100 truncate max-w-[8rem]">
                        {socialLevel != null
                          ? `Nv ${socialLevel}${socialLevelName ? ` · ${socialLevelName}` : ''}`
                          : '—'}
                      </div>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-[260px] text-xs">
                  <p className="font-semibold mb-1">Nível Social</p>
                  <p className="text-muted-foreground">
                    Reflete sua reputação na plataforma: posts, curtidas recebidas, comentários, salvos e tempo ativo. Quanto mais qualidade e consistência, maior o nível e o nome de prestígio.
                  </p>
                </TooltipContent>
              </Tooltip>

            </div>
          </TooltipProvider>

        </div>


        {/* Resumo recebidos/enviados, clicável */}
        <div className="relative mt-3 flex items-center gap-2 flex-wrap text-xs">
          <button
            type="button"
            onClick={() => setTab('received')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 dark:bg-amber-500/15 hover:bg-amber-500/30 dark:hover:bg-amber-500/25 border border-amber-500/50 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 font-semibold transition-colors"
          >
            <Gift className="h-3.5 w-3.5" /> {totalCount} recebidos
            <span className="text-amber-700/60 dark:text-amber-300/40">·</span>
            <Zap className="h-3.5 w-3.5" /> {totalReceived} XP
          </button>
          <button
            type="button"
            onClick={() => setTab('sent')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 dark:bg-emerald-500/15 hover:bg-emerald-500/30 dark:hover:bg-emerald-500/25 border border-emerald-500/50 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-semibold transition-colors"
          >
            <Send className="h-3.5 w-3.5" /> {totalSentCount} enviados
            <span className="text-emerald-700/60 dark:text-emerald-300/40">·</span>
            <Zap className="h-3.5 w-3.5" /> {totalSent} XP
          </button>

        </div>
      </div>

      {/* Status realtime + última atualização */}
      <div className="flex items-center justify-between gap-2 mb-2 text-xs">
        <div className="inline-flex items-center gap-2 text-muted-foreground">
          {status === 'live' ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Wifi className="h-3.5 w-3.5" /> Tempo real ativo
            </span>
          ) : status === 'fallback' ? (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <WifiOff className="h-3.5 w-3.5" /> Modo seguro (atualiza a cada 5s)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Conectando…
            </span>
          )}
          {isRefreshing && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              · <RefreshCw className="h-3 w-3 animate-spin" /> Recebendo dados…
            </span>
          )}
        </div>
        <span className="text-muted-foreground/80">
          Última atualização: {format(lastUpdatedAt, 'HH:mm:ss')}
        </span>
      </div>

      {/* Tabs + Atualizar */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex gap-1 p-1 bg-muted/40 rounded-xl w-fit">
          {([
            { k: 'received' as const, label: `Recebidos${totalCount ? ` (${totalCount})` : ''}` },
            { k: 'sent' as const,     label: `Enviados${totalSentCount ? ` (${totalSentCount})` : ''}` },
            { k: 'ranking' as const,  label: 'Ranking' },
          ]).map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                tab === k ? 'bg-amber-500 text-black' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 gap-1.5"
          title="Atualizar lista de presentes"
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      {tab === 'received' ? (
        <ReceivedList
          loading={received.isLoading}
          rows={received.data ?? []}
          onThank={handleThank}
          onBulkThank={handleBulkThank}
          thankingId={thankingId}
          thanked={thanked}
          bulkThanking={bulkThanking}
        />
      ) : tab === 'sent' ? (
        <SentList
          loading={sent.isLoading}
          rows={sent.data ?? []}
          totalSent={totalSent}
          totalSentCount={totalSentCount}
        />
      ) : (
        <div className="space-y-3">
          {/* Sub-toggle: Meus fãs vs Global do app */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex gap-1 p-1 bg-muted/40 rounded-xl w-fit">
              {([
                { k: 'fans' as const, label: `Meus fãs${ranking.data?.length ? ` (${ranking.data.length})` : ''}`, icon: <Heart className="h-3.5 w-3.5" /> },
                { k: 'global' as const, label: 'Top 20 do app', icon: <Trophy className="h-3.5 w-3.5" /> },
              ]).map(({ k, label, icon }) => (
                <button
                  key={k}
                  onClick={() => setRankScope(k)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-1.5',
                    rankScope === k ? 'bg-amber-500 text-black' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {rankScope === 'fans'
                ? 'Quem mais te enviou XP'
                : 'Quem mais recebe XP em todo o app'}
            </p>
          </div>

          <RankingList
            loading={rankScope === 'fans' ? ranking.isLoading : globalRanking.isLoading}
            rows={(rankScope === 'fans' ? ranking.data : globalRanking.data) ?? []}
            onThank={(sid) => handleThank(sid)}
            thankingId={thankingId}
            scope={rankScope}
          />
        </div>
      )}
    </div>
  );
}

/** Hook auxiliar: scroll infinito client-side. */
function useInfinitePage<T>(rows: T[], pageSize: number = PAGE_SIZE) {
  const [visible, setVisible] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reseta quando o tamanho da lista bruta muda significativamente
  const lenRef = useRef(rows.length);
  useEffect(() => {
    if (lenRef.current !== rows.length) {
      lenRef.current = rows.length;
      setVisible((v) => Math.max(pageSize, Math.min(v, rows.length)));
    }
  }, [rows.length, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + pageSize, rows.length));
        }
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, pageSize]);

  return { slice: rows.slice(0, visible), sentinelRef, hasMore: visible < rows.length };
}

function SortControl({
  value, onChange,
}: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger className="h-8 w-[160px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="recent">Mais recentes</SelectItem>
        <SelectItem value="xp">Maior XP</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ReceivedList({
  loading,
  rows,
  onThank,
  onBulkThank,
  thankingId,
  thanked,
  bulkThanking,
}: {
  loading: boolean;
  rows: AuraGiftRow[];
  onThank: (senderAuthId: string | null | undefined, giftId?: string) => void;
  onBulkThank: (items: { senderAuthId: string | null | undefined; giftId: string }[]) => void;
  thankingId: string | null;
  thanked: Set<string>;
  bulkThanking: boolean;
}) {
  const [sort, setSort] = useState<SortKey>('recent');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sort === 'xp') arr.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    else arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return arr;
  }, [rows, sort]);

  /** Apenas pendentes (não agradecidos) — base para o "selecionar todos". */
  const pendingGifts = useMemo(
    () => sorted.filter((g) => !(thanked.has(g.id) || !!g.thanked_at)),
    [sorted, thanked],
  );
  const allPendingSelected =
    pendingGifts.length > 0 && pendingGifts.every((g) => selectedIds.has(g.id));
  const someSelected = selectedIds.size > 0;

  // Mantém apenas IDs ainda pendentes no estado de seleção.
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      const pendingSet = new Set(pendingGifts.map((g) => g.id));
      prev.forEach((id) => { if (pendingSet.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [pendingGifts]);

  const toggleAllPending = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(pendingGifts.map((g) => g.id)));
    else setSelectedIds(new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleBulkClick = () => {
    const items = pendingGifts
      .filter((g) => selectedIds.has(g.id))
      .map((g) => ({ senderAuthId: g.sender_id, giftId: g.id }));
    onBulkThank(items);
  };

  const { slice, sentinelRef, hasMore } = useInfinitePage(sorted);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Gift className="h-10 w-10 mx-auto mb-3 opacity-50" />
        Você ainda não recebeu presentes. Continue interagindo!
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1 mb-1">
        <span className="text-xs text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? 'presente' : 'presentes'}
        </span>
        <SortControl value={sort} onChange={setSort} />
      </div>

      {/* Barra de seleção em lote — só exibe se existem pendentes */}
      {pendingGifts.length > 0 && (
        <div
          className={cn(
            'flex items-center justify-between gap-2 px-3 py-2 rounded-xl border sticky top-2 z-10 backdrop-blur',
            someSelected
              ? 'border-amber-500/60 bg-amber-500/15 dark:bg-amber-500/10'
              : 'border-border/60 bg-card/70',
          )}
        >
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={allPendingSelected}
              onCheckedChange={(v) => toggleAllPending(!!v)}
              aria-label="Selecionar todos os pendentes"
            />
            <span className="text-xs font-semibold text-foreground">
              Selecionar todos pendentes
              <span className="ml-1 text-muted-foreground font-normal">
                ({pendingGifts.length})
              </span>
            </span>
          </label>
          <Button
            type="button"
            size="sm"
            onClick={handleBulkClick}
            disabled={!someSelected || bulkThanking}
            className="bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 gap-1.5"
          >
            {bulkThanking ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-black/70 border-t-transparent animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <MessageCircle className="h-4 w-4" />
                Agradecer{someSelected ? ` (${selectedIds.size})` : ''}
              </>
            )}
          </Button>
        </div>
      )}

      {slice.map((g) => {
        const s = g.sender;
        const city = [s?.address_city, s?.address_state].filter(Boolean).join(' / ');
        const gen = genderLabel(s?.profile_type);
        const isThanked = thanked.has(g.id) || !!g.thanked_at;
        const isSelected = selectedIds.has(g.id);
        return (
          <div
            key={g.id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border bg-card/50 transition-colors',
              isSelected
                ? 'border-amber-500/70 ring-1 ring-amber-500/40 bg-amber-500/10'
                : isThanked
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : !g.seen
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : 'border-border/50',
            )}
          >
            {!isThanked ? (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(v) => toggleOne(g.id, !!v)}
                aria-label="Selecionar presente"
                className="shrink-0"
              />
            ) : (
              <div className="w-4 shrink-0" aria-hidden />
            )}
            <Avatar className="h-12 w-12">
              <AvatarImage src={s?.avatar_url || ''} />
              <AvatarFallback>{getHandleInitial(s)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground truncate">
                  {getPublicHandle(s)}
                </span>
                {!g.seen && !isThanked && (
                  <Badge className="bg-amber-500 text-black text-[10px] h-4 px-1.5 border-0">NOVO</Badge>
                )}
                {isThanked && (
                  <Badge className="bg-emerald-500 text-black text-[10px] h-4 px-1.5 border-0 gap-0.5">
                    <CheckCircle2 className="h-3 w-3" /> AGRADECIDO
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                {gen && <span>{gen}</span>}
                {city && (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" /> {city}
                  </span>
                )}
                <span>· {formatDistanceToNow(new Date(g.created_at), { addSuffix: true, locale: ptBR })}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-sm font-bold">
                <Zap className="h-3.5 w-3.5" /> {g.amount}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onThank(g.sender_id, g.id)}
                disabled={thankingId === g.sender_id || isThanked || bulkThanking}
                className={cn(
                  'border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 disabled:opacity-60',
                  isThanked && 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
                )}
              >
                {thankingId === g.sender_id ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
                    Enviando…
                  </span>
                ) : isThanked ? (
                  <><CheckCircle2 className="h-4 w-4 mr-1" /> Agradecido</>
                ) : (
                  <><MessageCircle className="h-4 w-4 mr-1" /> Agradecer</>
                )}
              </Button>
            </div>
          </div>
        );
      })}


      {hasMore && (
        <div ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="h-3 w-3 animate-spin" /> Carregando mais…
          </span>
        </div>
      )}
    </div>
  );
}

function SentList({
  loading,
  rows,
  totalSent,
  totalSentCount,
}: {
  loading: boolean;
  rows: AuraGiftSentRow[];
  totalSent: number;
  totalSentCount: number;
}) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>('recent');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [locFilter, setLocFilter] = useState<string>('');

  const filtered = useMemo(() => {
    const lf = locFilter.trim().toLowerCase();
    return rows.filter((g) => {
      const r = g.receiver;
      if (genderFilter !== 'all' && (r?.profile_type || '').toLowerCase() !== genderFilter) {
        return false;
      }
      if (lf) {
        const hay = [
          r?.address_city, r?.address_state,
          [r?.address_city, r?.address_state].filter(Boolean).join(' / '),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(lf)) return false;
      }
      return true;
    });
  }, [rows, genderFilter, locFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === 'xp') arr.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    else arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return arr;
  }, [filtered, sort]);

  const { slice, sentinelRef, hasMore } = useInfinitePage(sorted);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Send className="h-10 w-10 mx-auto mb-3 opacity-50" />
        Você ainda não enviou presentes. Apoie alguém especial!
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1 mb-1 text-xs text-muted-foreground">
        <span>{totalSentCount} {totalSentCount === 1 ? 'envio' : 'envios'}</span>
        <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
          Total enviado <Zap className="h-3 w-3" /> {totalSent} XP
        </span>
      </div>

      {/* Filtros + ordenação */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Tipo / gênero" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="male">Homem</SelectItem>
            <SelectItem value="female">Mulher</SelectItem>
            <SelectItem value="couple">Casal</SelectItem>
            <SelectItem value="trans">Trans</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={locFilter}
          onChange={(e) => setLocFilter(e.target.value)}
          placeholder="Cidade ou UF"
          className="h-8 w-[180px] text-xs"
        />
        <div className="ml-auto">
          <SortControl value={sort} onChange={setSort} />
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-8 text-xs text-muted-foreground">
          Nenhum envio corresponde aos filtros.
        </div>
      )}

      {slice.map((g) => {
        const r = g.receiver;
        const city = [r?.address_city, r?.address_state].filter(Boolean).join(' / ');
        const gen = genderLabel(r?.profile_type);
        const username = r?.username;
        return (
          <div
            key={g.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card/50"
          >
            <button
              type="button"
              onClick={() => username && navigate(`/profile/${username}`)}
              className="shrink-0"
              title={username ? `Ver perfil @${username}` : ''}
            >
              <Avatar className="h-12 w-12">
                <AvatarImage src={r?.avatar_url || ''} />
                <AvatarFallback>{getHandleInitial(r)}</AvatarFallback>
              </Avatar>
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground truncate">
                  {getPublicHandle(r)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                {gen && <span>{gen}</span>}
                {city && (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" /> {city}
                  </span>
                )}
                <span>
                  · Enviado {formatDistanceToNow(new Date(g.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 text-sm font-bold">
                <Send className="h-3 w-3" /> <Zap className="h-3.5 w-3.5" /> {g.amount}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(g.created_at), "dd/MM/yyyy HH:mm")}
              </span>
            </div>
          </div>
        );
      })}

      {hasMore && (
        <div ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="h-3 w-3 animate-spin" /> Carregando mais…
          </span>
        </div>
      )}
    </div>
  );
}

function RankingList({
  loading,
  rows,
  onThank,
  thankingId,
  scope = 'fans',
}: {
  loading: boolean;
  rows: AuraGiftRankRow[];
  onThank: (senderAuthId: string | null | undefined) => void;
  thankingId: string | null;
  scope?: 'fans' | 'global';
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy className="h-10 w-10 mx-auto mb-3 opacity-50" />
        {scope === 'fans'
          ? 'Ainda não há ranking — seus presentes vão aparecer aqui.'
          : 'Sem dados no ranking global ainda.'}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r, idx) => {
        const s = r.sender;
        const podium = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : null;
        const podiumWrap =
          podium === 'gold'
            ? 'border-amber-300/80 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-900 shadow-[0_4px_14px_-4px_rgba(245,158,11,0.55)]'
            : podium === 'silver'
            ? 'border-slate-300/80 bg-gradient-to-r from-slate-200 via-zinc-100 to-slate-300 text-zinc-900 shadow-[0_4px_14px_-4px_rgba(148,163,184,0.5)]'
            : podium === 'bronze'
            ? 'border-orange-400/70 bg-gradient-to-r from-orange-400 via-amber-600 to-yellow-700 text-zinc-50 shadow-[0_4px_14px_-4px_rgba(234,88,12,0.55)]'
            : 'border-border/50 bg-card/50';
        const podiumBadge =
          podium === 'gold'
            ? 'bg-zinc-900/85 text-amber-200'
            : podium === 'silver'
            ? 'bg-zinc-900/85 text-slate-100'
            : podium === 'bronze'
            ? 'bg-zinc-900/85 text-orange-100'
            : 'bg-muted text-foreground';
        const podiumMuted =
          podium === 'gold' || podium === 'silver'
            ? 'text-zinc-800/80'
            : podium === 'bronze'
            ? 'text-zinc-100/85'
            : 'text-muted-foreground';
        const podiumXp =
          podium
            ? 'bg-zinc-900/85 text-amber-200'
            : 'bg-amber-500/15 text-amber-300';
        return (
          <div
            key={r.sender_profile_id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border transition-shadow',
              podiumWrap,
            )}
          >
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ring-1 ring-black/10',
                podiumBadge,
              )}
            >
              {idx + 1}
            </div>
            <Avatar className={cn('h-11 w-11', podium && 'ring-2 ring-white/70')}>
              <AvatarImage src={s?.avatar_url || ''} />
              <AvatarFallback>{getHandleInitial(s)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('font-semibold truncate', podium ? 'drop-shadow-sm' : 'text-foreground')}>
                  {getPublicHandle(s)}
                </span>
                {podium === 'gold' && (
                  <Badge className="bg-zinc-900 text-amber-200 text-[10px] h-4 px-1.5 border-0 gap-0.5">
                    <Crown className="h-3 w-3" /> TOP
                  </Badge>
                )}
              </div>
              <p className={cn('text-xs', podiumMuted)}>
                {r.gifts_count} {r.gifts_count === 1 ? 'presente' : 'presentes'} {scope === 'fans' ? 'enviado' : 'recebido'}{r.gifts_count === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-bold', podiumXp)}>
                <Zap className="h-3.5 w-3.5" /> {r.total_xp}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onThank(r.sender_profile_id)}
                disabled={thankingId === r.sender_profile_id}
                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-60"
                title="Agradecer"
              >
                {thankingId === r.sender_profile_id ? (
                  <span className="h-3 w-3 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
