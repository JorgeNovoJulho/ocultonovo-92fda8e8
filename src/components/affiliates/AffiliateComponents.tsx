import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { mockAffiliates, type AffiliateApplication } from "@/lib/mockAffiliates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Check, ExternalLink, UserPlus, TrendingUp, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CopyLinkButton({ link }: { link: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setDone(true);
          toast.success("Link copiado!");
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Não foi possível copiar");
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      Copiar link
    </Button>
  );
}

function StatusBadge({ s }: { s: AffiliateApplication["status"] }) {
  const map: Record<typeof s, string> = {
    pending: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    approved: "bg-green-500/15 text-green-500 border-green-500/30",
    rejected: "bg-red-500/15 text-red-500 border-red-500/30",
  };
  const label = { pending: "Pendente", approved: "Aprovado", rejected: "Recusado" }[s];
  return <Badge variant="outline" className={map[s]}>{label}</Badge>;
}

/** Modal de candidatura — usado em telas de canal/criador */
export function AffiliateApplyModal({
  open,
  onOpenChange,
  channelId,
  channelTitle,
  creatorUsername,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channelId: string;
  channelTitle: string;
  creatorUsername: string;
}) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user) {
      toast.error("Faça login primeiro");
      return;
    }
    if (message.trim().length < 10) {
      toast.error("Conte um pouco sobre você (mínimo 10 caracteres)");
      return;
    }
    setSubmitting(true);
    try {
      mockAffiliates.apply({
        channel_id: channelId,
        channel_title: channelTitle,
        creator_username: creatorUsername,
        applicant_user_id: user.id,
        applicant_username: (user as any).user_metadata?.username || user.email?.split("@")[0] || "voce",
        message: message.trim(),
      });
      toast.success("Candidatura enviada!", {
        description: "Você receberá uma notificação quando o criador responder.",
      });
      setMessage("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Quero ser afiliado
          </DialogTitle>
          <DialogDescription>
            Você está se candidatando a divulgar <strong>{channelTitle}</strong>. Se aprovado,
            ganhará 5% sobre cada venda feita pelo seu link exclusivo.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Conte por que você seria um bom afiliado para este canal…"
          rows={4}
          maxLength={400}
        />
        <p className="text-[11px] text-right text-muted-foreground">{message.length}/400</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar candidatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Painel completo do afiliado — para o usuário ver seus links + ganhos */
export function MyAffiliateLinksPanel() {
  const { user } = useAuth();
  const [_, force] = useState(0);
  const [statsModal, setStatsModal] = useState<AffiliateApplication | null>(null);
  const [period, setPeriod] = useState<3 | 6 | 12 | 0>(6);

  useEffect(() => { const u = mockAffiliates.subscribe(() => force((n) => n + 1)); return () => { u; }; }, []);

  if (!user) return null;
  const apps = mockAffiliates.listForAffiliate(user.id);
  const earnings = mockAffiliates.earningsForAffiliate(user.id);
  const totalAll = mockAffiliates.totalForAffiliate(user.id);
  const monthly = useMemo(
    () => mockAffiliates.monthlyReportForAffiliate(user.id, period || undefined),
    [user.id, period, _],
  );
  const periodTotal = monthly.reduce((s, m) => s + m.total, 0);
  const periodSales = monthly.reduce((s, m) => s + m.sales, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-green-500" />
        <div>
          <p className="text-xs text-muted-foreground">Acumulado em comissões</p>
          <p className="text-2xl font-bold text-green-500">{fmtBRL(totalAll)}</p>
        </div>
      </div>

      <Tabs defaultValue="links">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="links">Meus links</TabsTrigger>
          <TabsTrigger value="monthly">Comissões mensais</TabsTrigger>
        </TabsList>

        <TabsContent value="links" className="mt-3">
          {apps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Você ainda não se candidatou a nenhum canal de afiliado.
            </p>
          ) : (
            <div className="space-y-3">
              {apps.map((app) => {
                const appEarnings = earnings.filter((e) => e.application_id === app.id);
                const appTotal = appEarnings.reduce((s, e) => s + e.commission_brl, 0);
                const stats = mockAffiliates.statsForApplication(app.id);
                const convRate = stats.clicks > 0 ? ((stats.conversions / stats.clicks) * 100).toFixed(1) : "0.0";
                return (
                  <div key={app.id} className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{app.channel_title}</p>
                        <p className="text-[11px] text-muted-foreground">por @{app.creator_username}</p>
                      </div>
                      <StatusBadge s={app.status} />
                    </div>

                    {app.status === "approved" && app.affiliate_link && (
                      <>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 truncate text-[11px] bg-muted/30 rounded px-2 py-1 font-mono">
                            {app.affiliate_link}
                          </code>
                          <CopyLinkButton link={app.affiliate_link} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1">
                          <div className="rounded-md bg-muted/30 py-1.5">
                            <p className="text-muted-foreground">Cliques</p>
                            <p className="font-bold text-foreground">{stats.clicks}</p>
                          </div>
                          <div className="rounded-md bg-muted/30 py-1.5">
                            <p className="text-muted-foreground">Conversões</p>
                            <p className="font-bold text-foreground">{stats.conversions}</p>
                          </div>
                          <div className="rounded-md bg-muted/30 py-1.5">
                            <p className="text-muted-foreground">Taxa</p>
                            <p className="font-bold text-foreground">{convRate}%</p>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="w-full text-xs gap-1.5" onClick={() => setStatsModal(app)}>
                          <TrendingUp className="h-3 w-3" /> Ver detalhes de performance
                        </Button>
                      </>
                    )}

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Comissão: <strong className="text-foreground">{app.commission_percent}%</strong> · Vendas:{" "}
                        <strong className="text-foreground">{appEarnings.length}</strong>
                      </span>
                      <span className="text-green-500 font-bold">{fmtBRL(appTotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="monthly" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground mr-1">Período:</span>
            {([
              { v: 3, l: "3 meses" },
              { v: 6, l: "6 meses" },
              { v: 12, l: "12 meses" },
              { v: 0, l: "Tudo" },
            ] as const).map((opt) => (
              <Button
                key={opt.v}
                size="sm"
                variant={period === opt.v ? "default" : "outline"}
                className="h-7 text-[11px] px-2"
                onClick={() => setPeriod(opt.v as any)}
              >
                {opt.l}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <p className="text-[11px] text-muted-foreground">Comissão no período</p>
              <p className="text-lg font-bold text-green-500">{fmtBRL(periodTotal)}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <p className="text-[11px] text-muted-foreground">Vendas no período</p>
              <p className="text-lg font-bold">{periodSales}</p>
            </div>
          </div>

          {monthly.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma comissão registrada no período selecionado.
            </p>
          ) : (
            <div className="space-y-2">
              {monthly.map((m) => (
                <div key={m.month} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        {new Date(m.month + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{m.sales} venda(s)</p>
                    </div>
                    <p className="text-base font-bold text-green-500">{fmtBRL(m.total)}</p>
                  </div>
                  {m.applicationIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/30">
                      {m.applicationIds.map((aid) => {
                        const a = mockAffiliates.applicationById(aid);
                        if (!a) return null;
                        return (
                          <Button
                            key={aid}
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 gap-1"
                            onClick={() => setStatsModal(a)}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {a.channel_title}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                <p className="text-sm font-semibold">Total acumulado (geral)</p>
                <p className="text-lg font-bold text-green-500">{fmtBRL(totalAll)}</p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!statsModal} onOpenChange={(v) => !v && setStatsModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes · {statsModal?.channel_title}</DialogTitle>
            <DialogDescription>Estatísticas e candidatura do seu link de afiliado.</DialogDescription>
          </DialogHeader>
          {statsModal && (() => {
            const stats = mockAffiliates.statsForApplication(statsModal.id);
            const eg = mockAffiliates.earningsForApplication(statsModal.id);
            const totalC = eg.reduce((s, e) => s + e.commission_brl, 0);
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusBadge s={statsModal.status} />
                  <span className="text-[11px] text-muted-foreground">por @{statsModal.creator_username}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-muted/30 py-2">
                    <p className="text-muted-foreground">Cliques</p>
                    <p className="text-lg font-bold">{stats.clicks}</p>
                  </div>
                  <div className="rounded-md bg-muted/30 py-2">
                    <p className="text-muted-foreground">Conversões</p>
                    <p className="text-lg font-bold">{stats.conversions}</p>
                  </div>
                  <div className="rounded-md bg-green-500/10 py-2">
                    <p className="text-muted-foreground">Comissão</p>
                    <p className="text-lg font-bold text-green-500">{fmtBRL(totalC)}</p>
                  </div>
                </div>
                {statsModal.affiliate_link && (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate text-[11px] bg-muted/30 rounded px-2 py-1 font-mono">
                      {statsModal.affiliate_link}
                    </code>
                    <CopyLinkButton link={statsModal.affiliate_link} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Vendas recentes</p>
                  {eg.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhuma venda ainda.</p>}
                  {eg.map((e) => (
                    <div key={e.id} className="flex items-center justify-between text-xs border-b border-border/40 py-1">
                      <span>@{e.buyer_username}</span>
                      <span className="text-green-500 font-semibold">{fmtBRL(e.commission_brl)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Painel do criador — gerenciar candidaturas recebidas */
export function CreatorAffiliateInbox({ creatorUsername }: { creatorUsername: string }) {
  const [_, force] = useState(0);
  const [profileModal, setProfileModal] = useState<AffiliateApplication | null>(null);
  const [confirm, setConfirm] = useState<{ app: AffiliateApplication; action: "approved" | "rejected" } | null>(null);

  useEffect(() => { const u = mockAffiliates.subscribe(() => force((n) => n + 1)); return () => { u; }; }, []);

  const apps = mockAffiliates.listForCreator(creatorUsername);
  const grouped = useMemo(() => ({
    pending: apps.filter((a) => a.status === "pending"),
    approved: apps.filter((a) => a.status === "approved"),
    rejected: apps.filter((a) => a.status === "rejected"),
  }), [apps]);

  const askDecide = (app: AffiliateApplication, status: "approved" | "rejected") =>
    setConfirm({ app, action: status });

  const confirmDecide = () => {
    if (!confirm) return;
    try {
      const updated = mockAffiliates.decide(confirm.app.id, confirm.action);
      if (!updated) throw new Error("not_found");
      if (confirm.action === "approved") {
        toast.success("Afiliado aprovado!", {
          description: `Link gerado para @${updated.applicant_username}. Disponível em "Meus links".`,
        });
      } else {
        toast.success("Candidatura recusada", {
          description: `@${updated.applicant_username} foi notificado.`,
        });
      }
      setProfileModal(null);
    } catch {
      toast.error("Não foi possível atualizar a candidatura", {
        description: "Tente novamente em instantes.",
      });
    } finally {
      setConfirm(null);
    }
  };

  return (
    <>
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="pending">
            Pendentes <Badge className="ml-2">{grouped.pending.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved">Aprovados ({grouped.approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Recusados ({grouped.rejected.length})</TabsTrigger>
        </TabsList>

        {(["pending", "approved", "rejected"] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-3 mt-3">
            {grouped[tab].length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma candidatura {tab === "pending" ? "pendente" : tab === "approved" ? "aprovada" : "recusada"}.
              </p>
            )}
            {grouped[tab].map((app) => (
              <div key={app.id} className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">@{app.applicant_username}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Para: {app.channel_title} ·{" "}
                      {new Date(app.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <StatusBadge s={app.status} />
                </div>
                <p className="text-xs italic text-muted-foreground border-l-2 border-border pl-2">
                  "{app.message}"
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/30">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setProfileModal(app)}
                  >
                    <ExternalLink className="h-3 w-3" /> Ver perfil
                  </Button>
                  {app.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => askDecide(app, "approved")}>
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={() => askDecide(app, "rejected")}
                      >
                        Recusar
                      </Button>
                    </>
                  )}
                  {app.status === "approved" && app.affiliate_link && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <code className="text-[10px] bg-muted/40 rounded px-2 py-1 font-mono truncate max-w-[180px]">
                        {app.affiliate_link}
                      </code>
                      <CopyLinkButton link={app.affiliate_link} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!profileModal} onOpenChange={(v) => !v && setProfileModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detalhes da candidatura
              {profileModal && <StatusBadge s={profileModal.status} />}
            </DialogTitle>
            <DialogDescription>
              Veja a mensagem do candidato e decida agora mesmo.
            </DialogDescription>
          </DialogHeader>
          {profileModal && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1">
                <p>
                  <strong>Username:</strong>{" "}
                  <Link to={`/${profileModal.applicant_username}`} className="text-primary underline">
                    @{profileModal.applicant_username}
                  </Link>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Para o canal: <strong className="text-foreground">{profileModal.channel_title}</strong>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Enviada em {new Date(profileModal.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1">Mensagem do candidato</p>
                <p className="text-sm italic border-l-2 border-primary/40 pl-3 py-1 text-muted-foreground">
                  "{profileModal.message}"
                </p>
              </div>
              {profileModal.status === "pending" ? (
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1"
                    onClick={() => askDecide(profileModal, "approved")}
                  >
                    Aprovar afiliado
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => askDecide(profileModal, "rejected")}
                  >
                    Recusar
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground text-center">
                  Decisão registrada em{" "}
                  {profileModal.decided_at
                    ? new Date(profileModal.decided_at).toLocaleString("pt-BR")
                    : "—"}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "approved" ? "Aprovar afiliado?" : "Recusar candidatura?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "approved" ? (
                <>
                  Você vai aprovar <strong>@{confirm?.app.applicant_username}</strong> como afiliado de{" "}
                  <strong>{confirm?.app.channel_title}</strong>. Um link exclusivo será gerado e ele
                  passará a receber {confirm?.app.commission_percent}% por venda.
                </>
              ) : (
                <>
                  Tem certeza que deseja recusar a candidatura de{" "}
                  <strong>@{confirm?.app.applicant_username}</strong>? Esta decisão pode ser revista depois.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDecide}
              className={confirm?.action === "rejected" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirm?.action === "approved" ? "Confirmar aprovação" : "Confirmar recusa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ============================================================
 * Painel de DESEMPENHO do afiliado — cliques, conversões,
 * comissão e gráfico por período (3 / 6 / 12 meses) — MOCK
 * ============================================================ */
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { BarChart3 } from "lucide-react";

export function AffiliatePerformanceDashboard() {
  const { user } = useAuth();
  const [_, force] = useState(0);
  const [period, setPeriod] = useState<3 | 6 | 12>(6);

  useEffect(() => {
    const u = mockAffiliates.subscribe(() => force((n) => n + 1));
    return () => { u; };
  }, []);

  if (!user) return null;
  const apps = mockAffiliates.listForAffiliate(user.id);

  // Agrega cliques + conversões + comissão por mês (determinístico via mock)
  const { series, totals } = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("pt-BR", { month: "short" }),
      });
    }

    // distribuição mock por mês a partir de stats agregadas + earnings
    const aggClicks = apps.reduce((s, a) => s + mockAffiliates.statsForApplication(a.id).clicks, 0);
    const aggConv = apps.reduce((s, a) => s + mockAffiliates.statsForApplication(a.id).conversions, 0);
    const earnings = mockAffiliates.earningsForAffiliate(user.id);
    const aggCommission = earnings.reduce((s, e) => s + e.commission_brl, 0);

    const series = months.map((m, idx) => {
      const w = (idx + 1) / months.length; // crescimento gradual
      const noise = ((idx * 13 + period) % 7) / 10;
      return {
        month: m.label,
        cliques: Math.round(aggClicks * (w * 0.6 + noise * 0.1)),
        conversoes: Math.round(aggConv * (w * 0.7 + noise * 0.05)),
        comissao: Number((aggCommission * (w * 0.8 + noise * 0.05)).toFixed(2)),
      };
    });

    const totals = series.reduce(
      (acc, s) => ({
        cliques: acc.cliques + s.cliques,
        conversoes: acc.conversoes + s.conversoes,
        comissao: acc.comissao + s.comissao,
      }),
      { cliques: 0, conversoes: 0, comissao: 0 },
    );
    return { series, totals };
  }, [user.id, period, apps, _]);

  const taxaConv = totals.cliques > 0 ? ((totals.conversoes / totals.cliques) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Desempenho do meu link</h3>
        </div>
        <div className="flex gap-1">
          {[3, 6, 12].map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              className="h-7 text-[11px] px-2"
              onClick={() => setPeriod(p as 3 | 6 | 12)}
            >
              {p}m
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-border/60 bg-card/40 p-3">
          <p className="text-[11px] text-muted-foreground">Cliques</p>
          <p className="text-lg font-bold">{totals.cliques}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 p-3">
          <p className="text-[11px] text-muted-foreground">Conversões</p>
          <p className="text-lg font-bold">
            {totals.conversoes} <span className="text-[10px] text-muted-foreground">({taxaConv}%)</span>
          </p>
        </div>
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
          <p className="text-[11px] text-muted-foreground">Comissão</p>
          <p className="text-lg font-bold text-green-500">{fmtBRL(totals.comissao)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40 p-3">
        <p className="text-[11px] text-muted-foreground mb-2">Evolução nos últimos {period} meses</p>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gComm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(34,197,94)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="rgb(34,197,94)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) =>
                  name === "comissao" ? fmtBRL(v) : v
                }
              />
              <Area type="monotone" dataKey="cliques" stroke="hsl(var(--primary))" fill="url(#gClicks)" name="Cliques" />
              <Area type="monotone" dataKey="conversoes" stroke="hsl(var(--primary))" fill="none" strokeDasharray="4 3" name="Conversões" />
              <Area type="monotone" dataKey="comissao" stroke="rgb(34,197,94)" fill="url(#gComm)" name="Comissão" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        * Dados simulados (mock) para fins de demonstração do fluxo de afiliados.
      </p>
    </div>
  );
}
