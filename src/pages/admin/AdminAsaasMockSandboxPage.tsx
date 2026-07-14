/**
 * Admin Master > Financeiro > Sandbox ASAAS (Mock)
 *
 * Página 100% mock — não toca no banco e não chama ASAAS.
 * Permite validar:
 *  1. Checkout Crédito + PIX (com tela de sucesso)
 *  2. Tela de status do pagamento (CONFIRMED, REFUNDED, CHARGEBACK, SUBSCRIPTION_*)
 *  3. Simulador de eventos PAYMENT_* / SUBSCRIPTION_* roteando para handlers
 *  4. Visualizador de logs mock do pix-webhook (idempotência com asaas_event_id)
 */
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, RefreshCw, AlertTriangle, CreditCard, QrCode,
  Copy, Sparkles, ShieldCheck, Webhook, FlaskConical, Repeat, Ban,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================
// Tipos compartilhados
// ============================================================
type AsaasEventType =
  | "PAYMENT_CREATED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_CHARGEBACK_REQUESTED"
  | "PAYMENT_CHARGEBACK_DISPUTE"
  | "PAYMENT_AWAITING_CHARGEBACK_REVERSAL"
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "SUBSCRIPTION_INACTIVATED"
  | "SUBSCRIPTION_DELETED";

interface MockLog {
  id: string;
  asaas_event_id: string;
  event_type: AsaasEventType;
  payment_id: string;
  status: "received" | "processed" | "duplicated" | "failed";
  handler: string;
  payload: any;
  processing_ms: number;
  received_at: string;
}

const EVENT_OPTIONS: AsaasEventType[] = [
  "PAYMENT_CREATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_DELETED",
];

// Roteamento espelhando pix-webhook/index.ts
function routeHandler(evt: AsaasEventType): { handler: string; effect: string } {
  if (evt === "PAYMENT_CONFIRMED" || evt === "PAYMENT_RECEIVED") {
    return { handler: "processPaymentConfirmed", effect: "Marca transação 'paid' + dispara split (process_payment_split)" };
  }
  if (evt === "PAYMENT_OVERDUE") {
    return { handler: "processPaymentOverdue", effect: "Marca transação 'overdue' + libera grace period" };
  }
  if (evt === "PAYMENT_REFUNDED") {
    return { handler: "processRefund", effect: "Estorno: reverte saldo creator (add_to_balance negativo) + Discord" };
  }
  if (evt.startsWith("PAYMENT_CHARGEBACK")) {
    return {
      handler: "processChargeback",
      effect: evt === "PAYMENT_CHARGEBACK_REQUESTED"
        ? "Cria chargebacks row + bloqueia saldo creator + Discord"
        : "Atualiza status do chargeback + Discord",
    };
  }
  if (evt.startsWith("SUBSCRIPTION_")) {
    return {
      handler: "processSubscriptionEvent",
      effect: "Upsert oculto_asaas_subscriptions (last_event, raw_payload). Discord se cancel/inactive.",
    };
  }
  return { handler: "ignored", effect: "Evento sem handler — retorna 200 sem processar" };
}

// ============================================================
// Helpers visuais
// ============================================================
function statusBadge(s: string) {
  const map: Record<string, string> = {
    processed: "bg-green-500/20 text-green-500 border-green-500/30",
    received: "bg-blue-500/20 text-blue-500 border-blue-500/30",
    duplicated: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
    failed: "bg-destructive/20 text-destructive border-destructive/30",
  };
  return map[s] || "bg-muted text-muted-foreground";
}

// ============================================================
// Página
// ============================================================
export default function AdminAsaasMockSandboxPage() {
  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-4">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Sandbox ASAAS (Mock)</h1>
          <p className="text-sm text-muted-foreground">
            Ambiente isolado para validar checkout, status, eventos de webhook e idempotência — sem tocar produção.
          </p>
        </div>
      </div>

      <Tabs defaultValue="checkout" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
          <TabsTrigger value="checkout">Checkout</TabsTrigger>
          <TabsTrigger value="status">Status do Pagamento</TabsTrigger>
          <TabsTrigger value="events">Simulador de Eventos</TabsTrigger>
          <TabsTrigger value="logs">Logs Mock (Idempotência)</TabsTrigger>
        </TabsList>

        <TabsContent value="checkout" className="mt-4">
          <CheckoutMockTab />
        </TabsContent>
        <TabsContent value="status" className="mt-4">
          <PaymentStatusMockTab />
        </TabsContent>
        <TabsContent value="events" className="mt-4">
          <EventSimulatorTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <MockLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// 1) Checkout Mock (Crédito + PIX) com tela de sucesso
// ============================================================
function CheckoutMockTab() {
  const [method, setMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [stage, setStage] = useState<"form" | "processing" | "success" | "failed">("form");
  const [amount, setAmount] = useState("29.90");
  const [plan, setPlan] = useState("Premium");

  const reset = () => setStage("form");

  const submit = (outcome: "success" | "failed") => {
    setStage("processing");
    setTimeout(() => {
      setStage(outcome);
      if (outcome === "success") toast.success(`✅ ${method} confirmado (mock)`);
      else toast.error(`❌ ${method} falhou (mock)`);
    }, 1200);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Fluxo de Checkout Mock
        </CardTitle>
        <CardDescription>
          Simula o fluxo completo Crédito/PIX → confirma se a tela de sucesso aparece.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stage === "form" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Método</Label>
                <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plano</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Premium">Premium (R$ 25,90)</SelectItem>
                    <SelectItem value="VIP">VIP (R$ 145,90)</SelectItem>
                    <SelectItem value="PPV">Conteúdo PPV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Valor (R$)</Label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>

            {method === "PIX" ? (
              <div className="rounded-lg bg-muted/30 p-6 text-center space-y-3">
                <QrCode className="h-32 w-32 mx-auto text-foreground" strokeWidth={1} />
                <Badge variant="outline">QR Code MOCK</Badge>
                <Button variant="outline" size="sm" className="gap-2"
                  onClick={() => { navigator.clipboard.writeText("MOCK-PIX-COPIA-COLA-XXX"); toast.success("Código copiado"); }}>
                  <Copy className="h-4 w-4" /> Copiar código PIX
                </Button>
              </div>
            ) : (
              <div className="rounded-lg bg-muted/30 p-4 space-y-2">
                <Input placeholder="4111 1111 1111 1111" />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="MM/AA" />
                  <Input placeholder="CVV" />
                </div>
                <Input placeholder="Nome no cartão" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => submit("success")}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Simular Sucesso
              </Button>
              <Button variant="destructive" onClick={() => submit("failed")}>
                <XCircle className="h-4 w-4 mr-2" /> Simular Falha
              </Button>
            </div>
          </>
        )}

        {stage === "processing" && (
          <div className="py-12 flex flex-col items-center gap-3">
            <RefreshCw className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Processando {method}…</p>
          </div>
        )}

        {stage === "success" && (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-emerald-500/20 p-5">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-500">Pagamento Confirmado!</h3>
            <p className="text-sm text-muted-foreground">
              Plano <strong>{plan}</strong> ativado · R$ {amount} · via {method}
            </p>
            <Sparkles className="h-6 w-6 text-yellow-500 animate-pulse" />
            <Button variant="outline" onClick={reset}>Testar de novo</Button>
          </div>
        )}

        {stage === "failed" && (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-destructive/20 p-5">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <h3 className="text-2xl font-bold text-destructive">Pagamento Recusado</h3>
            <p className="text-sm text-muted-foreground">Status do usuário: inadimplente (mock)</p>
            <Button variant="outline" onClick={reset}>Tentar novamente</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// 2) Status Mock (CONFIRMED / REFUNDED / CHARGEBACK / SUBSCRIPTION)
// ============================================================
const STATUS_PRESETS = [
  {
    key: "PAYMENT_CONFIRMED",
    label: "Pagamento Confirmado",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/20",
    desc: "Saldo creditado, split disparado, notificação enviada.",
    timeline: ["PAYMENT_CREATED", "PAYMENT_CONFIRMED", "Split processado", "Saldo D+7 agendado"],
  },
  {
    key: "PAYMENT_REFUNDED",
    label: "Pagamento Estornado",
    icon: Repeat,
    color: "text-orange-500",
    bg: "bg-orange-500/20",
    desc: "Estorno aplicado: saldo creator revertido (add_to_balance negativo).",
    timeline: ["PAYMENT_CONFIRMED", "PAYMENT_REFUNDED", "Reversal inserido", "Discord notificado"],
  },
  {
    key: "PAYMENT_CHARGEBACK_REQUESTED",
    label: "Chargeback Solicitado",
    icon: Ban,
    color: "text-destructive",
    bg: "bg-destructive/20",
    desc: "Disputa aberta: chargebacks row criada, saldo creator BLOQUEADO.",
    timeline: ["PAYMENT_CONFIRMED", "PAYMENT_CHARGEBACK_REQUESTED", "Saldo bloqueado", "Discord alertado"],
  },
  {
    key: "SUBSCRIPTION_CREATED",
    label: "Assinatura Criada",
    icon: Sparkles,
    color: "text-primary",
    bg: "bg-primary/20",
    desc: "Upsert em oculto_asaas_subscriptions (last_event=SUBSCRIPTION_CREATED).",
    timeline: ["SUBSCRIPTION_CREATED", "Upsert subscriptions", "Plano ativado"],
  },
  {
    key: "SUBSCRIPTION_INACTIVATED",
    label: "Assinatura Cancelada",
    icon: XCircle,
    color: "text-muted-foreground",
    bg: "bg-muted",
    desc: "Subscription marcada inativa, Discord notificado.",
    timeline: ["SUBSCRIPTION_CREATED", "SUBSCRIPTION_INACTIVATED", "Plano rebaixado para Free"],
  },
] as const;

function PaymentStatusMockTab() {
  const [selected, setSelected] = useState<typeof STATUS_PRESETS[number]["key"]>("PAYMENT_CONFIRMED");
  const preset = STATUS_PRESETS.find((p) => p.key === selected)!;
  const Icon = preset.icon;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Cenários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {STATUS_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setSelected(p.key)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${
                selected === p.key ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <div className={`inline-flex items-center gap-3 rounded-lg p-4 ${preset.bg}`}>
            <Icon className={`h-8 w-8 ${preset.color}`} />
            <div>
              <CardTitle className={preset.color}>{preset.label}</CardTitle>
              <CardDescription>{preset.key}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{preset.desc}</p>
          <Separator />
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Timeline esperada</Label>
            <ol className="mt-2 space-y-1 text-sm">
              {preset.timeline.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <Badge variant="outline" className="shrink-0">{i + 1}</Badge>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
          <Separator />
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Handler invocado</Label>
            <pre className="mt-2 p-3 rounded-md bg-muted text-xs overflow-x-auto">
              {JSON.stringify(routeHandler(preset.key as AsaasEventType), null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// 3) Simulador de eventos — roteia para handlers e gera logs mock
// ============================================================
let LOG_STORE: MockLog[] = [];
const LOG_LISTENERS = new Set<() => void>();
function pushLog(l: MockLog) { LOG_STORE = [l, ...LOG_STORE].slice(0, 200); LOG_LISTENERS.forEach((f) => f()); }
function clearLogs() { LOG_STORE = []; LOG_LISTENERS.forEach((f) => f()); }

function EventSimulatorTab() {
  const [event, setEvent] = useState<AsaasEventType>("PAYMENT_CONFIRMED");
  const [paymentId, setPaymentId] = useState("pay_mock_001");
  const [eventId, setEventId] = useState("evt_mock_001");
  const [autoEventId, setAutoEventId] = useState(true);

  const route = useMemo(() => routeHandler(event), [event]);

  const fire = (forceDuplicate = false) => {
    const finalEventId = autoEventId ? `${event}_${paymentId}` : eventId;
    const isDup = LOG_STORE.some((l) => l.asaas_event_id === finalEventId);

    const log: MockLog = {
      id: crypto.randomUUID(),
      asaas_event_id: finalEventId,
      event_type: event,
      payment_id: paymentId,
      status: isDup ? "duplicated" : "processed",
      handler: route.handler,
      payload: {
        event,
        payment: { id: paymentId, value: 29.9, status: event.replace("PAYMENT_", "") },
      },
      processing_ms: Math.floor(Math.random() * 200) + 30,
      received_at: new Date().toISOString(),
    };
    pushLog(log);

    if (isDup) toast.warning(`Duplicidade bloqueada (${finalEventId})`, { description: "asaas_event_id já existe → 200 sem reprocessar" });
    else toast.success(`Evento processado → ${route.handler}`);

    if (forceDuplicate) {
      setTimeout(() => {
        const dup: MockLog = { ...log, id: crypto.randomUUID(), status: "duplicated", processing_ms: 5, received_at: new Date().toISOString() };
        pushLog(dup);
        toast.warning("Retry automático ASAAS bloqueado pela idempotência");
      }, 600);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" /> Simulador de Eventos ASAAS</CardTitle>
        <CardDescription>Dispara eventos mock e mostra qual handler do <code>pix-webhook</code> seria invocado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Tipo de evento</Label>
            <Select value={event} onValueChange={(v: any) => setEvent(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_OPTIONS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>payment_id</Label>
            <Input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>asaas_event_id</Label>
              <Button size="sm" variant="ghost" onClick={() => setAutoEventId(!autoEventId)}>
                {autoEventId ? "Auto (event_paymentId)" : "Manual"}
              </Button>
            </div>
            <Input
              value={autoEventId ? `${event}_${paymentId}` : eventId}
              onChange={(e) => setEventId(e.target.value)}
              disabled={autoEventId}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <strong>Handler:</strong> <code>{route.handler}</code>
          </div>
          <p className="text-xs text-muted-foreground">{route.effect}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => fire(false)}>Disparar evento</Button>
          <Button variant="outline" onClick={() => fire(true)}>Disparar + retry duplicado</Button>
          <Button variant="ghost" onClick={clearLogs}>Limpar logs mock</Button>
        </div>

        <p className="text-xs text-muted-foreground">
          ℹ️ Idempotência: o segundo evento com o mesmo <code>asaas_event_id</code> vai aparecer como
          <Badge variant="outline" className="mx-1">duplicated</Badge> e não chama o handler novamente.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 4) Visualizador de logs mock (idempotência)
// ============================================================
function MockLogsTab() {
  const [, setTick] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<MockLog | null>(null);

  // subscribe
  useMemo(() => {
    const fn = () => setTick((t) => t + 1);
    LOG_LISTENERS.add(fn);
    return () => { LOG_LISTENERS.delete(fn); };
  }, []);

  const logs = LOG_STORE.filter((l) => filter === "all" || l.status === filter);
  const stats = useMemo(() => ({
    total: LOG_STORE.length,
    processed: LOG_STORE.filter((l) => l.status === "processed").length,
    duplicated: LOG_STORE.filter((l) => l.status === "duplicated").length,
    failed: LOG_STORE.filter((l) => l.status === "failed").length,
  }), [LOG_STORE.length]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Processados" value={stats.processed} color="text-emerald-500" />
        <StatCard label="Duplicados (idempotência)" value={stats.duplicated} color="text-yellow-500" />
        <StatCard label="Falhas" value={stats.failed} color="text-destructive" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Logs mock do pix-webhook</CardTitle>
            <CardDescription>Espelha a tabela <code>oculto_asaas_webhook_logs</code></CardDescription>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="processed">Processados</SelectItem>
              <SelectItem value="duplicated">Duplicados</SelectItem>
              <SelectItem value="failed">Falhas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Nenhum log ainda — vá na aba <strong>Simulador de Eventos</strong> e dispare um evento.
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recebido</TableHead>
                    <TableHead>asaas_event_id</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Handler</TableHead>
                    <TableHead>ms</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{new Date(l.received_at).toLocaleTimeString()}</TableCell>
                      <TableCell className="font-mono text-xs">{l.asaas_event_id}</TableCell>
                      <TableCell className="text-xs">{l.event_type}</TableCell>
                      <TableCell><Badge variant="outline" className={statusBadge(l.status)}>{l.status}</Badge></TableCell>
                      <TableCell className="text-xs"><code>{l.handler}</code></TableCell>
                      <TableCell className="text-xs">{l.processing_ms}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => setSelected(l)}>ver</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Payload do log</DialogTitle></DialogHeader>
          {selected && (
            <pre className="p-3 rounded-md bg-muted text-xs overflow-auto max-h-[60vh]">
              {JSON.stringify(selected, null, 2)}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${color || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
