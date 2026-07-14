import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, Copy, Trophy, Users, ClipboardCheck, Calendar, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getOrCreateConversationId } from "@/lib/conversationsApi";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

type Period = "week" | "biweek" | "month" | "semester" | "year" | "all";
const PERIOD_LABELS: Record<Period, string> = {
  week: "Semanal", biweek: "Quinzenal", month: "Mensal",
  semester: "Semestral", year: "Anual", all: "Total",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creatorProfileId: string;
  channelUrl: string; // ex: https://ocultoswing.com.br/canal/<id>
  channelName?: string;
  channelBanner?: string | null;
  ownerUsername?: string | null;
}

export default function CreatorAffiliateManagerModal({
  open,
  onOpenChange,
  creatorProfileId,
  channelUrl,
  channelName,
  channelBanner,
  ownerUsername,
}: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  // Candidaturas pendentes
  const reqs = useQuery({
    queryKey: ["creator-affreq", creatorProfileId],
    enabled: open && !!creatorProfileId,
    queryFn: async () => {
      const { data: rows } = await (supabase as any)
        .from("oculto_affiliate_requests")
        .select("id,affiliate_user_id,status,message,created_at,decided_at,rejection_reason")
        .eq("creator_profile_id", creatorProfileId)
        .order("created_at", { ascending: false });
      const list = rows || [];
      const ids = [...new Set(list.map((r: any) => r.affiliate_user_id))];
      const profMap = new Map<string, any>();
      if (ids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,user_id,username,display_name,name,avatar_url")
          .in("user_id", ids as string[]);
        (ps || []).forEach((p: any) => profMap.set(p.user_id, p));
      }
      return list.map((r: any) => ({ ...r, profile: profMap.get(r.affiliate_user_id) }));
    },
  });

  // Lista de afiliados ativos
  const affiliates = useQuery({
    queryKey: ["creator-affiliates", creatorProfileId],
    enabled: open && !!creatorProfileId,
    queryFn: async () => {
      const { data: rows } = await (supabase as any)
        .from("creator_referrals")
        .select("id,afilhada_id,referral_code,status,approved_at,total_commission_earned,last_commission_at,created_at")
        .eq("madrinha_id", creatorProfileId)
        .eq("status", "active")
        .order("approved_at", { ascending: false });
      const list = rows || [];
      const ids = list.map((r: any) => r.afilhada_id);
      const profMap = new Map<string, any>();
      if (ids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,user_id,username,display_name,name,avatar_url")
          .in("id", ids as string[]);
        (ps || []).forEach((p: any) => profMap.set(p.id, p));
      }
      return list.map((r: any) => ({ ...r, profile: profMap.get(r.afilhada_id) }));
    },
  });

  // Ranking RPC
  const ranking = useQuery({
    queryKey: ["creator-affranking", creatorProfileId, period, from, to],
    enabled: open && !!creatorProfileId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("creator_affiliate_ranking", {
        _creator_profile_id: creatorProfileId,
        _period: period,
        _from: from ? new Date(from).toISOString() : null,
        _to: to ? new Date(to).toISOString() : null,
      });
      if (error) throw error;
      const list = (data || []) as any[];
      const ids = list.map((r) => r.affiliate_id).filter(Boolean);
      const profMap = new Map<string, any>();
      if (ids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,username,display_name,name,avatar_url")
          .in("id", ids);
        (ps || []).forEach((p: any) => profMap.set(p.id, p));
      }
      return list.map((r) => ({ ...r, profile: profMap.get(r.affiliate_id) }));
    },
  });

  // Série diária para o gráfico (vendas + comissões)
  const series = useQuery({
    queryKey: ["creator-affseries", creatorProfileId, period, from, to],
    enabled: open && !!creatorProfileId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("creator_affiliate_daily_series", {
        _creator_profile_id: creatorProfileId,
        _period: period,
        _from: from ? new Date(from).toISOString() : null,
        _to: to ? new Date(to).toISOString() : null,
      });
      if (error) throw error;
      return (data || []) as Array<{ day: string; sales: number; gross: number; commission: number }>;
    },
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("creator_approve_affiliate", { _request_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidatura aprovada");
      qc.invalidateQueries({ queryKey: ["creator-affreq", creatorProfileId] });
      qc.invalidateQueries({ queryKey: ["creator-affiliates", creatorProfileId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao aprovar"),
  });

  const rejectMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await (supabase as any).rpc("creator_reject_affiliate", { _request_id: id, _reason: reason ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidatura rejeitada");
      qc.invalidateQueries({ queryKey: ["creator-affreq", creatorProfileId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao rejeitar"),
  });

  const buildLink = (code: string) =>
    `${channelUrl}${channelUrl.includes("?") ? "&" : "?"}ref=${encodeURIComponent(code)}`;

  const copy = async (txt: string) => {
    try { await navigator.clipboard.writeText(txt); toast.success("Link copiado"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  /**
   * Envia uma DM para o afiliado aprovado contendo:
   * - Banner do canal, nome e @username do dono
   * - Mensagem de parabéns
   * - Link de afiliado exclusivo
   *
   * Usa o tipo `affiliate_approval` em messages.media_type para que o chat
   * possa renderizar um card especial no futuro; o `content` traz a versão
   * legível usada como fallback em qualquer cliente.
   */
  const sendApprovalDM = async (a: any) => {
    if (!user?.id) {
      toast.error("Faça login para enviar a mensagem.");
      return;
    }
    const recipientUserId: string | undefined = a.profile?.user_id;
    if (!recipientUserId) {
      toast.error("Afiliado sem usuário vinculado.");
      return;
    }
    const link = buildLink(a.referral_code);
    const channelTitle = channelName || "este canal";
    const ownerHandle = ownerUsername ? `@${ownerUsername}` : "";

    setSendingTo(a.id);
    try {
      const { id: convId, error: convErr } = await getOrCreateConversationId(user.id, recipientUserId);
      if (convErr || !convId) throw convErr || new Error("Não foi possível abrir a conversa");

      // sender_id segue convenção do projeto: profile.id do remetente (creator)
      const text =
        `🎉 Parabéns! Você foi aprovado(a) como afiliado(a) do canal *${channelTitle}*` +
        (ownerHandle ? ` (${ownerHandle})` : "") +
        `.\n\nEste é o seu link de afiliado exclusivo — toda venda originada por ele gera comissão para você:\n${link}\n\nBoas vendas! 💛`;

      const payload: any = {
        conversation_id: convId,
        sender_id: creatorProfileId,
        content: text,
        media_type: "affiliate_approval",
        metadata: {
          kind: "affiliate_approval",
          channel_name: channelTitle,
          channel_banner: channelBanner || null,
          owner_username: ownerUsername || null,
          referral_code: a.referral_code,
          referral_link: link,
        },
      };

      let { error } = await (supabase as any).from("messages").insert(payload);
      if (error) {
        // fallback se a coluna metadata não existir nesta instância
        const fallback = { ...payload };
        delete fallback.metadata;
        const retry = await (supabase as any).from("messages").insert(fallback);
        if (retry.error) throw retry.error;
      }

      toast.success("Mensagem enviada no chat");
      setSentTo((prev) => new Set(prev).add(a.id));
    } catch (e: any) {
      console.warn("[AffiliateApprovalDM] erro:", e);
      toast.error(e?.message || "Erro ao enviar mensagem");
    } finally {
      setSendingTo(null);
    }
  };


  const filteredAffiliates = useMemo(() => {
    const list = affiliates.data || [];
    if (!from && !to) return list;
    const fromTs = from ? new Date(from).getTime() : -Infinity;
    const toTs = to ? new Date(to).getTime() + 86_400_000 : Infinity;
    return list.filter((a: any) => {
      const ts = a.approved_at ? new Date(a.approved_at).getTime() : 0;
      return ts >= fromTs && ts <= toTs;
    });
  }, [affiliates.data, from, to]);

  const pending = (reqs.data || []).filter((r: any) => r.status === "pending");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          max-w-4xl p-0 gap-0 overflow-hidden flex flex-col
          w-[calc(100vw-0.75rem)] sm:w-full
          h-[calc(100dvh-0.75rem)] sm:h-[min(90dvh,46rem)]
          max-h-[calc(100dvh-0.75rem)] sm:max-h-[90dvh]
          rounded-xl
        "
      >
        <DialogHeader className="px-3 sm:px-4 py-2.5 sm:py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
            <span className="truncate">Gestão de afiliados do canal</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="requests" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-3 sm:mx-4 mt-2 sm:mt-3 grid grid-cols-3 w-auto shrink-0 h-auto">
            <TabsTrigger value="requests" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm px-1 sm:px-3 py-1.5">
              <ClipboardCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="truncate">Candidaturas</span>
              {pending.length > 0 && <Badge className="ml-0.5 h-4 px-1 text-[10px] bg-amber-500 text-black">{pending.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="affiliates" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm px-1 sm:px-3 py-1.5">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Afiliados
            </TabsTrigger>
            <TabsTrigger value="ranking" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm px-1 sm:px-3 py-1.5">
              <Trophy className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Ranking
            </TabsTrigger>
          </TabsList>

          {/* CANDIDATURAS */}
          <TabsContent value="requests" className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide px-3 sm:px-4 py-3 space-y-2">
            {reqs.isLoading ? <Skeleton className="h-24 w-full" /> : (
              <>
                {(reqs.data || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma candidatura recebida ainda.</p>
                )}
                {(reqs.data || []).map((r: any) => {
                  const name = r.profile?.username ? `@${r.profile.username}` : "Usuário";
                  return (
                    <Card key={r.id} className="p-3 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={r.profile?.avatar_url || ""} />
                        <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Enviada em {new Date(r.created_at).toLocaleDateString("pt-BR")}
                          {r.message ? ` · "${r.message}"` : ""}
                        </p>
                        {r.status !== "pending" && (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            {r.status === "approved" ? "Aprovada" : r.status === "rejected" ? "Rejeitada" : r.status}
                            {r.decided_at ? ` em ${new Date(r.decided_at).toLocaleDateString("pt-BR")}` : ""}
                          </Badge>
                        )}
                      </div>
                      {r.status === "pending" && (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => approveMut.mutate(r.id)}>
                            <Check className="h-4 w-4 mr-1" /> Aprovar
                          </Button>
                          <Button size="sm" variant="destructive" className="h-8" onClick={() => {
                            const reason = prompt("Motivo da rejeição (opcional):") || undefined;
                            rejectMut.mutate({ id: r.id, reason });
                          }}>
                            <X className="h-4 w-4 mr-1" /> Negar
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </>
            )}
          </TabsContent>

          {/* AFILIADOS */}
          <TabsContent value="affiliates" className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide px-3 sm:px-4 py-3 space-y-3">
            <div className="flex items-end gap-2 flex-wrap text-xs">
              <div className="flex-1 min-w-[120px]">
                <label className="text-muted-foreground">De</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8" />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-muted-foreground">Até</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8" />
              </div>
              {(from || to) && (
                <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>Limpar</Button>
              )}
            </div>

            {affiliates.isLoading ? <Skeleton className="h-24 w-full" /> : filteredAffiliates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum afiliado ativo no período.</p>
            ) : filteredAffiliates.map((a: any) => {
              const name = a.profile?.username ? `@${a.profile.username}` : "Afiliado";
              const link = buildLink(a.referral_code);
              return (
                <Card key={a.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={a.profile?.avatar_url || ""} />
                      <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Aprovado em {a.approved_at ? new Date(a.approved_at).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-amber-500/50 text-amber-500">
                      {fmt(Number(a.total_commission_earned || 0))}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/30 rounded-md p-2">
                    <code className="flex-1 text-[11px] truncate">{link}</code>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(link)} title="Copiar link">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className={sentTo.has(a.id)
                      ? "w-full h-8 border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10"
                      : "w-full h-8 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"}
                    disabled={sendingTo === a.id || !a.profile?.user_id || sentTo.has(a.id)}
                    onClick={() => sendApprovalDM(a)}
                    title={!a.profile?.user_id ? "Afiliado sem usuário vinculado" : sentTo.has(a.id) ? "Link já enviado" : "Enviar parabéns + link no chat"}
                  >
                    {sendingTo === a.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : sentTo.has(a.id) ? (
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                    ) : (
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {sentTo.has(a.id) ? "Enviado Link para o Afiliado" : "Enviar parabéns + link no chat"}
                  </Button>
                </Card>
              );
            })}
          </TabsContent>

          {/* RANKING */}
          <TabsContent value="ranking" className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide px-3 sm:px-4 py-3 space-y-3">
            <div className="flex flex-wrap gap-1">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? "default" : "outline"}
                  className={period === p ? "bg-amber-500 hover:bg-amber-600 text-black h-8" : "h-8"}
                  onClick={() => { setPeriod(p); setFrom(""); setTo(""); }}
                >
                  {PERIOD_LABELS[p]}
                </Button>
              ))}
            </div>

            {/* Gráfico simples de comissões/vendas por dia */}
            <CommissionChart data={series.data || []} loading={series.isLoading} />

            {ranking.isLoading ? <Skeleton className="h-24 w-full" /> : (ranking.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem vendas via afiliados no período.</p>
            ) : (ranking.data || []).map((r: any, idx: number) => {
              const name = r.profile?.username ? `@${r.profile.username}` : "Afiliado";
              return (
                <Card key={r.affiliate_id || idx} className="p-3 flex items-center gap-3">
                  <span className="w-6 text-center font-bold text-amber-500">{idx + 1}</span>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={r.profile?.avatar_url || ""} />
                    <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {Number(r.sales)} venda(s) · bruto {fmt(Number(r.gross))} · última {r.last_sale_at ? new Date(r.last_sale_at).toLocaleDateString("pt-BR") : "—"}
                    </p>
                  </div>
                  <Badge className="bg-amber-500 text-black">{fmt(Number(r.commission))}</Badge>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---- Gráfico SVG simples (barras = comissão/dia) ----
function CommissionChart({
  data,
  loading,
}: {
  data: Array<{ day: string; sales: number; gross: number; commission: number }>;
  loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!data || data.length === 0) {
    return (
      <Card className="p-4 text-xs text-muted-foreground">
        Nenhuma venda no período para exibir no gráfico.
      </Card>
    );
  }
  const W = 640, H = 140, P = 28;
  const max = Math.max(...data.map((d) => Number(d.commission) || 0), 1);
  const totalCommission = data.reduce((s, d) => s + (Number(d.commission) || 0), 0);
  const totalSales = data.reduce((s, d) => s + (Number(d.sales) || 0), 0);
  const bw = (W - P * 2) / Math.max(data.length, 1);

  return (
    <Card className="p-3 sm:p-4 space-y-2 bg-card/60">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Comissões por dia
        </p>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-muted-foreground">
            {totalSales} venda{totalSales === 1 ? "" : "s"}
          </span>
          <Badge className="bg-amber-500 text-black">{fmt(totalCommission)}</Badge>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 min-w-[320px]">
          <line x1={P} y1={H - P / 1.5} x2={W - P} y2={H - P / 1.5} stroke="hsl(var(--border))" strokeWidth="1" />
          {data.map((d, i) => {
            const v = Number(d.commission) || 0;
            const h = ((H - P * 2) * v) / max;
            const x = P + i * bw + 2;
            const y = H - P / 1.5 - h;
            const dayLabel = new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            return (
              <g key={d.day}>
                <rect
                  x={x}
                  y={y}
                  width={Math.max(bw - 4, 2)}
                  height={Math.max(h, 1)}
                  rx={2}
                  fill="hsl(45 93% 50%)"
                  opacity={0.85}
                >
                  <title>{`${dayLabel} · ${fmt(v)} (${d.sales} venda${d.sales === 1 ? "" : "s"})`}</title>
                </rect>
                {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
                  <text
                    x={x + (bw - 4) / 2}
                    y={H - 4}
                    textAnchor="middle"
                    fontSize="9"
                    fill="hsl(var(--muted-foreground))"
                  >
                    {dayLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}
