import { useEffect, useMemo, useState } from "react";
import { Gift, Loader2, Wifi, CheckCircle2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { MASTER_OPEN_ONLINE_GIFT_EVENT } from "./MasterOnlineAlertProvider";
import { useOnlineCounterStore } from "@/store/useOnlineCounterStore";
import { getMasterHandleLabel, isMasterUsernameVariant } from "@/lib/masterUsername";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 30) return "agora";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AMOUNT = 100;

interface OnlineRow {
  profile_id: string;
  user_id: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  plan_type: string | null;
  aura_level: number | null;
  last_seen: string | null;
  already_gifted: boolean;
}

const ONLINE_WINDOW_SECONDS = 2 * 60;
const SEND_TIMEOUT_MS = 12_000;

async function sendGiftWithTimeout(profileId: string) {
  return await Promise.race([
    (supabase as any).rpc("admin_master_gift_single_xp", {
      p_receiver_profile_id: profileId,
      p_amount: AMOUNT,
    }),
    new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error("Tempo esgotado ao enviar presente.")), SEND_TIMEOUT_MS),
    ),
  ]);
}

function useOnlineUnrewarded(enabled: boolean) {
  const qc = useQueryClient();
  const { setCount } = useOnlineCounterStore();

  useEffect(() => {
    if (!enabled) return;
    return subscribeTable('profiles', (payload: any) => {
      const isRelevant =
        payload.new?.is_online !== payload.old?.is_online ||
        payload.new?.last_seen !== payload.old?.last_seen ||
        isMasterUsernameVariant(payload.new?.username) ||
        isMasterUsernameVariant(payload.old?.username);
      if (isRelevant) {
        qc.invalidateQueries({ queryKey: ["master-online-unrewarded"] });
        qc.invalidateQueries({ queryKey: ["online-count-real"] });
        qc.invalidateQueries({ queryKey: ["online-users"] });
      }
    });
  }, [enabled, qc]);


  const query = useQuery<OnlineRow[]>({
    queryKey: ["master-online-unrewarded"],
    enabled,
    refetchInterval: 5_000,
    refetchOnWindowFocus: false,
    staleTime: 2_000,
    queryFn: async () => {
      try {
        const cutoff = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000).toISOString();

        // Fonte ÚNICA — mesma query que alimenta o card "Online Agora".
        // (RPC master_online_unrewarded_get foi descartado: dependia de auth.uid()
        // e divergia do contador do card, causando "0" no modal vs "4" no card.)
        const { data: rows, error } = await (supabase as any)
          .from('profiles')
          .select('id, user_id, username, name, avatar_url, plan_type, aura_level, last_seen, is_seed, is_test_account, banned_at')
          .eq('is_online', true)
          .gte('last_seen', cutoff)
          .not('username', 'eq', 'ocultomaster')
          .or('is_seed.is.null,is_seed.eq.false')
          .or('is_test_account.is.null,is_test_account.eq.false')
          .order('last_seen', { ascending: false })
          .limit(500);

        if (error) {
          console.warn('[OnlineUsersDialog] profiles query failed:', error.message);
          return [];
        }

        const onlineRows = (rows || []).filter((p: any) => !p.banned_at && !isMasterUsernameVariant(p.username));
        const profileIds = onlineRows.map((p: any) => p.id);

        // Determina quem já recebeu presente do master (sessão atual do master logado).
        let giftedSet = new Set<string>();
        if (profileIds.length > 0) {
          try {
            const { data: authUser } = await supabase.auth.getUser();
            const senderId = authUser?.user?.id;
            if (senderId) {
              const { data: gifts } = await (supabase as any)
                .from('oculto_aura_xp_gifts')
                .select('receiver_id')
                .eq('sender_id', senderId)
                .in('receiver_id', profileIds);
              giftedSet = new Set((gifts || []).map((g: any) => g.receiver_id));
            }
          } catch { /* fail-open: mostra todos como pendentes */ }
        }

        return onlineRows.map((p: any) => ({
          profile_id: p.id,
          user_id: p.user_id ?? null,
          username: p.username ?? null,
          name: p.name ?? null,
          avatar_url: p.avatar_url ?? null,
          plan_type: p.plan_type ?? null,
          aura_level: p.aura_level ?? null,
          last_seen: p.last_seen ?? null,
          already_gifted: giftedSet.has(p.id),
        })) as OnlineRow[];
      } catch (err: any) {
        console.warn('[OnlineUsersDialog] failed:', err?.message ?? err);
        return [];
      }
    },
  });

  // Sincroniza o store global quando o admin abre este modal
  useEffect(() => {
    if (enabled && query.data !== undefined) {
      setCount(query.data.length);
    }
  }, [enabled, query.data, setCount]);

  return query;
}

export function OnlineUsersDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [sendingAll, setSendingAll] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ sent: number; amount: number } | null>(null);
  // Tracking otimista local: usuários presenteados nesta sessão (anti-duplicidade imediata)
  const [locallyGifted, setLocallyGifted] = useState<Set<string>>(new Set());
  const liveQueryEnabled = open || sendingAll || !!sendingId;
  const { data: usersRaw = [], isLoading } = useOnlineUnrewarded(liveQueryEnabled);

  const users = useMemo<OnlineRow[]>(
    () => usersRaw.map((u) => (locallyGifted.has(u.profile_id) ? { ...u, already_gifted: true } : u)),
    [usersRaw, locallyGifted],
  );

  // Auto-abrir quando alerta master dispara
  useEffect(() => {
    const onOpen = () => onOpenChange(true);
    window.addEventListener(MASTER_OPEN_ONLINE_GIFT_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(MASTER_OPEN_ONLINE_GIFT_EVENT, onOpen as EventListener);
  }, [onOpenChange]);

  const total = users.length;
  const pending = useMemo(() => users.filter((u) => !u.already_gifted), [users]);
  const pendingCount = pending.length;

  const requestSendAll = async () => {
    if (pendingCount === 0) {
      toast.info("Todos os usuários online já receberam o presente.");
      return;
    }
    await handleSendAll();
  };

  const handleSendAll = async () => {
    setSendingAll(true);
    try {
      let sent = 0;
      let failed = 0;
      const newlyGifted = new Set(locallyGifted);
      for (const u of pending) {
        try {
          const { data, error } = await sendGiftWithTimeout(u.profile_id) as any;
          if (error) throw error;

          if ((data as any)?.ok) {
            sent += 1;
            newlyGifted.add(u.profile_id);
          } else if ((data as any)?.already_gifted) {
            newlyGifted.add(u.profile_id);
          } else {
            failed += 1;
          }
        } catch (error: any) {
          failed += 1;
          console.warn('[OnlineUsersDialog] send all item failed:', error?.message ?? error, u.profile_id);
        }
      }
      setLocallyGifted(newlyGifted);
      setSummary({ sent, amount: AMOUNT });
      qc.invalidateQueries({ queryKey: ["master-online-unrewarded"] });
      if (failed > 0) {
        toast.warning(`${failed} ${failed === 1 ? 'envio falhou' : 'envios falharam'}.`);
      } else if (sent > 0) {
        toast.success(`Presentes enviados para ${sent} ${sent === 1 ? 'usuário' : 'usuários'}.`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha ao enviar presentes");
    } finally {
      setSendingAll(false);
    }
  };

  const handleSendOne = async (row: OnlineRow) => {
    if (row.already_gifted || locallyGifted.has(row.profile_id)) return;
    setSendingId(row.profile_id);
    try {
      const { data, error } = await sendGiftWithTimeout(row.profile_id) as any;
      if (error) throw error;
      // Marca otimisticamente como presenteado (independente de já ter sido antes)
      setLocallyGifted((prev) => {
        const next = new Set(prev);
        next.add(row.profile_id);
        return next;
      });
      if ((data as any)?.already_gifted) {
        toast.info(`@${row.username || "usuário"} já havia recebido.`);
      } else {
        toast.success(`+${AMOUNT} XP enviado a @${row.username || "usuário"}`);
      }
      qc.invalidateQueries({ queryKey: ["master-online-unrewarded"] });
    } catch (err: any) {
          const msg = err?.message || "Falha ao enviar presente";
          if (/master only/i.test(msg)) toast.error(`Apenas ${getMasterHandleLabel()} pode enviar este presente.`);
      else toast.error(msg);
    } finally {
      setSendingId(null);
    }
  };

  const closeSummary = () => { setSummary(null); onOpenChange(false); };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[calc(100vw-1rem)] sm:w-full max-w-lg max-h-[90dvh] sm:max-h-[85dvh] flex flex-col p-3 sm:p-6 gap-3 overflow-hidden"
        >
          <DialogHeader className="pr-8 shrink-0 min-w-0">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg min-w-0">
              <Wifi className="h-5 w-5 text-emerald-500 shrink-0" />
              <span className="truncate min-w-0">Usuários online · {total}</span>
              <span className="ml-auto flex items-center gap-1 text-[10px] sm:text-[11px] font-normal text-muted-foreground shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ao vivo
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm break-words">
              Envie {AMOUNT} XP como <span className="font-semibold text-foreground">{getMasterHandleLabel()}</span>.{" "}
              {pendingCount === 0 && total > 0 && (
                <span className="text-emerald-500">Todos já receberam.</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="pt-1 pb-2 border-b shrink-0">
            <Button
              onClick={requestSendAll}
              disabled={sendingAll || isLoading || pendingCount === 0}
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90 h-11"
            >
              {sendingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
              <span className="truncate">
                {sendingAll
                  ? "Enviando presentes…"
                  : pendingCount === 0
                  ? total === 0 ? "Ninguém online" : "Todos já presenteados"
                  : `Enviar para ${pendingCount} ${pendingCount === 1 ? "pendente" : "pendentes"}`}
              </span>
            </Button>
          </div>

          <ScrollArea className="flex-1 -mx-3 sm:-mx-6 px-3 sm:px-6 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                Ninguém online no momento.
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {users.map((u) => {
                  const handle = u.username ? `@${u.username}` : "Usuário";
                  const initial = (u.username || u.name || "U").slice(0, 1).toUpperCase();
                  const isSending = sendingId === u.profile_id;
                  return (
                    <li key={u.profile_id} className="flex items-center gap-2 sm:gap-3 py-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={u.avatar_url || undefined} loading="lazy" />
                          <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium">{handle}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                          {u.aura_level != null && <span className="shrink-0">Nv {u.aura_level}</span>}
                          <span className="shrink-0">· {timeAgo(u.last_seen)}</span>
                          {u.plan_type && u.plan_type !== "free" && (
                            <Badge variant="outline" className="text-[9px] uppercase h-4 px-1 shrink-0">
                              {u.plan_type}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {u.already_gifted ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-emerald-500/40 text-emerald-500 shrink-0 text-[10px] sm:text-xs px-1.5 sm:px-2"
                        >
                          <Check className="h-3 w-3" />
                          <span className="hidden sm:inline">Presenteado</span>
                          <span className="sm:hidden">OK</span>
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          disabled={isSending || sendingAll}
                          onClick={() => handleSendOne(u)}
                          className="gap-1 shrink-0 h-9 px-2 sm:px-3 text-xs sm:text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90"
                        >
                          {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gift className="h-3 w-3" />}
                          +{AMOUNT}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!summary} onOpenChange={(o) => !o && closeSummary()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Presentes enviados
            </DialogTitle>
            <DialogDescription>Resumo da distribuição por {getMasterHandleLabel()}.</DialogDescription>
          </DialogHeader>
          {summary && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Presenteados</p>
                <p className="mt-1 text-3xl font-bold">{summary.sent}</p>
              </div>
              <div className="rounded-lg border bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">XP por usuário</p>
                <p className="mt-1 text-3xl font-bold flex items-center justify-center gap-1">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  {summary.amount}
                </p>
              </div>
              <div className="col-span-2 rounded-lg border border-dashed p-3 text-center text-sm">
                Total distribuído:{" "}
                <span className="font-semibold">
                  {(summary.sent * summary.amount).toLocaleString("pt-BR")} XP
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={closeSummary} className="w-full">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
