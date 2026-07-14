/**
 * Tutorial passo-a-passo para configurar e ativar o Asaas (PIX + Cartão + Split + Saques).
 * Renderizado dentro da página /admin/pix para o Admin Master.
 * Sem chamadas pesadas — apenas conteúdo estático + Accordion (lazy paint).
 */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  BookOpen,
  ExternalLink,
  Copy,
  CheckCheck,
  Sparkles,
  ShieldCheck,
  Webhook,
  CreditCard,
  Banknote,
  KeyRound,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseExternal";
import { Loader2, PlugZap, XCircle } from "lucide-react";
import { ProductionActivationChecklist } from "./ProductionActivationChecklist";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

const WEBHOOK_URL =
  `${EXTERNAL_SUPABASE_URL}/functions/v1/asaas-webhook`;
const CARD_ENDPOINT =
  `${EXTERNAL_SUPABASE_URL}/functions/v1/asaas-card-checkout`;
const PIX_ENDPOINT =
  `${EXTERNAL_SUPABASE_URL}/functions/v1/pix-gateway`;
const PAYOUT_ENDPOINT =
  `${EXTERNAL_SUPABASE_URL}/functions/v1/creator-payout`;

function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs break-all">
      <span className="flex-1">{value}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          toast({ title: "Copiado!", description: value });
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? (
          <CheckCheck className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

export function AsaasSetupTutorial() {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BookOpen className="h-5 w-5 text-primary" />
              Tutorial Oficial — Configuração Asaas
              <Badge variant="outline" className="border-primary/40">
                v2026.05
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Guia completo para ativar PIX, Cartão de Crédito, Split de
              Pagamentos e Saques (PIX para criadores) no sistema.
            </CardDescription>
          </div>
          <a
            href="https://docs.asaas.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Docs Asaas
            </Button>
          </a>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle>Antes de começar</AlertTitle>
          <AlertDescription className="text-sm">
            Tenha em mãos a conta <strong>PJ Asaas</strong> aprovada (KYC
            completo), CNPJ verificado e um <strong>e-mail corporativo</strong>{" "}
            de notificações. Sem KYC aprovado o split e os saques ficam
            bloqueados pela Asaas.
          </AlertDescription>
        </Alert>

        <Accordion type="single" collapsible className="w-full">
          {/* STEP 1 */}
          <AccordionItem value="step-1">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <span className="font-semibold">
                  1. Obter API Key de produção
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm">
              <ol className="ml-5 list-decimal space-y-1.5">
                <li>
                  Acesse{" "}
                  <a
                    href="https://www.asaas.com/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    asaas.com
                  </a>{" "}
                  e faça login na conta principal (PJ).
                </li>
                <li>
                  Vá em <strong>Integrações → API → Gerar nova chave</strong>.
                </li>
                <li>
                  Copie a chave que começa com{" "}
                  <code className="rounded bg-muted px-1">$aact_</code> (produção)
                  ou <code className="rounded bg-muted px-1">$aact_YTU5...</code>{" "}
                  (sandbox).
                </li>
                <li>
                  Cole no campo <strong>"API Key"</strong> abaixo e selecione o{" "}
                  <strong>provider "Asaas"</strong>.
                </li>
                <li>
                  Marque <strong>Sandbox</strong> apenas se for teste — em
                  produção desmarque.
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>

          {/* STEP 2 */}
          <AccordionItem value="step-2">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-primary" />
                <span className="font-semibold">
                  2. Configurar Webhook (essencial)
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm">
              <p>
                O webhook é o que <strong>libera o pagamento</strong> no sistema
                automaticamente após confirmação. Sem ele, nada destrava.
              </p>
              <ol className="ml-5 list-decimal space-y-1.5">
                <li>
                  No painel Asaas: <strong>Integrações → Webhooks → Novo</strong>.
                </li>
                <li>Cole esta URL no campo "URL do Webhook":</li>
              </ol>
              <CopyLine value={WEBHOOK_URL} />
              <ol className="ml-5 list-decimal space-y-1.5" start={3}>
                <li>
                  Versão da API: <strong>v3</strong>.
                </li>
                <li>
                  Eventos a marcar:{" "}
                  <code className="rounded bg-muted px-1">PAYMENT_CONFIRMED</code>
                  ,{" "}
                  <code className="rounded bg-muted px-1">PAYMENT_RECEIVED</code>
                  ,{" "}
                  <code className="rounded bg-muted px-1">
                    PAYMENT_OVERDUE
                  </code>
                  ,{" "}
                  <code className="rounded bg-muted px-1">PAYMENT_REFUNDED</code>
                  ,{" "}
                  <code className="rounded bg-muted px-1">TRANSFER_DONE</code>.
                </li>
                <li>
                  Tipo de envio: <strong>Sequencial</strong>.
                </li>
                <li>
                  E-mail para falhas: o e-mail do admin master.
                </li>
                <li>
                  Gere um <strong>Token de autenticação</strong> e cole no campo
                  "Webhook Secret" abaixo (mesmo valor nos dois lados).
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>

          {/* STEP 3 */}
          <AccordionItem value="step-3">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-semibold">3. Cadastrar a Chave PIX</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm">
              <ol className="ml-5 list-decimal space-y-1.5">
                <li>
                  No Asaas: <strong>Conta → Chaves PIX → Cadastrar</strong> (use
                  CNPJ ou Aleatória).
                </li>
                <li>
                  Após confirmação, copie a chave e cole no campo{" "}
                  <strong>"Chave PIX"</strong> abaixo.
                </li>
                <li>
                  Selecione o <strong>tipo</strong> correspondente (CNPJ, Email,
                  Aleatória, etc.).
                </li>
                <li>
                  Esta chave recebe <strong>apenas</strong> os repasses da
                  plataforma — os criadores recebem em chaves próprias (etapa 6).
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>

          {/* STEP 4 */}
          <AccordionItem value="step-4">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="font-semibold">
                  4. Habilitar Cartão de Crédito + Split
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm">
              <p>
                O sistema usa a edge function{" "}
                <code className="rounded bg-muted px-1">asaas-card-checkout</code>{" "}
                que aplica o split <strong>servidor-autoritativo</strong>{" "}
                (74% criador / 20% plataforma / 6% reserva fiscal — ajustável em
                Configurações → Splits).
              </p>
              <ol className="ml-5 list-decimal space-y-1.5">
                <li>
                  No painel Asaas: <strong>Conta → Antifraude</strong> → ative
                  proteção (recomendado: nível Médio).
                </li>
                <li>
                  Em <strong>Cobrança → Cartão</strong>, habilite parcelamento
                  até 12x (sem juros até 3x ideal).
                </li>
                <li>
                  Em <strong>Split → Permissões</strong>, autorize sua aplicação
                  a fazer split automático.
                </li>
                <li>Endpoint usado pelo sistema (auto, JWT obrigatório):</li>
              </ol>
              <CopyLine value={CARD_ENDPOINT} />
            </AccordionContent>
          </AccordionItem>

          {/* STEP 5 */}
          <AccordionItem value="step-5">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-semibold">5. Validar PIX (QR Code)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm">
              <p>Endpoint utilizado pelos checkouts PIX do app:</p>
              <CopyLine value={PIX_ENDPOINT} />
              <ol className="ml-5 list-decimal space-y-1.5">
                <li>
                  Use o botão <strong>"Testar Conexão"</strong> abaixo — deve
                  retornar OK.
                </li>
                <li>
                  Use o card <strong>"Teste de Venda PIX"</strong> ao final
                  desta página: gera QR de R$ 1,00, polling 3s, libera
                  automaticamente quando pago.
                </li>
                <li>
                  Em <strong>/admin/payment-test</strong> tem suite completa de
                  validação (PIX + Cartão + Split).
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>

          {/* STEP 6 */}
          <AccordionItem value="step-6">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" />
                <span className="font-semibold">
                  6. Saques de criadores (PIX)
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm">
              <p>
                Cada criador cadastra a própria chave PIX em{" "}
                <strong>Perfil → Financeiro → Métodos de Pagamento</strong>.
                Mínimo de saque: <strong>R$ 50,00</strong>. Prazo:{" "}
                <strong>até 3 dias úteis</strong>.
              </p>
              <p>Endpoint do payout (executado pelo admin ao aprovar):</p>
              <CopyLine value={PAYOUT_ENDPOINT} />
              <ol className="ml-5 list-decimal space-y-1.5">
                <li>
                  No Asaas, garanta saldo suficiente em{" "}
                  <strong>Conta → Saldo</strong>.
                </li>
                <li>
                  Em <strong>/admin/withdrawals</strong>, aprove ou rejeite
                  pedidos. A aprovação dispara transferência via API.
                </li>
                <li>
                  O criador é notificado por e-mail (Resend) e push.
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>

          {/* STEP 7 */}
          <AccordionItem value="step-7">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="font-semibold">
                  7. Configurar Split (Admin Master)
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm">
              <p>
                Vá em <strong>/admin/settings → Splits</strong>. Os percentuais
                ficam em <code>system_settings</code>:
              </p>
              <ul className="ml-5 list-disc space-y-1">
                <li>
                  <code>platform_fee_percentage</code> — % da plataforma
                  (padrão 20).
                </li>
                <li>
                  <code>tax_reserve_percentage</code> — % reserva fiscal
                  (padrão 6).
                </li>
                <li>
                  <code>creator_percentage</code> — % do criador (padrão 74).
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                A soma <strong>deve fechar 100%</strong>. O backend rejeita
                cálculos inconsistentes.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* STEP 8 */}
          <AccordionItem value="step-8">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <span className="font-semibold">8. Ativar em Produção</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm">
              <ol className="ml-5 list-decimal space-y-1.5">
                <li>
                  Desmarque <strong>Sandbox</strong> e cole a key{" "}
                  <code>$aact_</code> (produção).
                </li>
                <li>
                  Marque <strong>"Gateway Ativo"</strong>.
                </li>
                <li>
                  Clique em <strong>"Salvar Configuração"</strong>.
                </li>
                <li>
                  Rode <strong>"Testar Conexão"</strong> e o{" "}
                  <strong>"Teste PIX R$1"</strong> ao final desta página.
                </li>
                <li>
                  Acompanhe em <strong>/admin/checkout-health</strong> o
                  Sentinel de pagamentos por 24h.
                </li>
              </ol>
              <Alert className="border-green-500/40 bg-green-500/5">
                <CheckCheck className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-sm">
                  Pronto. Quando o Sentinel mostrar{" "}
                  <strong>0 transações órfãs</strong> e o webhook responder{" "}
                  <strong>200 OK</strong> nas últimas 10 cobranças, o gateway
                  está estável em produção.
                </AlertDescription>
              </Alert>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <ConnectionTestPanel />
        <ProductionActivationChecklist />
      </CardContent>
    </Card>
  );
}

type TestStatus = "idle" | "loading" | "ok" | "error";

function ConnectionTestPanel() {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [details, setDetails] = useState<any>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const { toast } = useToast();

  const runTest = async () => {
    setStatus("loading");
    setMessage("");
    setDetails(null);
    setElapsed(null);
    const t0 = performance.now();
    setStartedAt(Date.now());
    try {
      const { data, error } = await supabase.functions.invoke("pix-gateway", {
        body: { action: "test-connection" },
      });
      const ms = Math.round(performance.now() - t0);
      setElapsed(ms);
      if (error) {
        setStatus("error");
        setMessage(error.message || "Erro ao invocar edge function");
        setDetails({ error });
        toast({
          title: "Falha na conexão",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      const ok = !!data?.success;
      setStatus(ok ? "ok" : "error");
      setMessage(
        data?.message ||
          (ok ? "Gateway Asaas operacional ✅" : "Falha ao validar gateway"),
      );
      setDetails(data);
      toast({
        title: ok ? "Conexão OK" : "Conexão falhou",
        description: data?.message || "",
        variant: ok ? "default" : "destructive",
      });
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      setElapsed(ms);
      setStatus("error");
      setMessage(e?.message || String(e));
      setDetails({ error: String(e) });
    }
  };

  const borderClass =
    status === "ok"
      ? "border-green-500/40 bg-green-500/5"
      : status === "error"
        ? "border-red-500/40 bg-red-500/5"
        : "border-primary/30 bg-primary/5";

  return (
    <Card className={`mt-2 ${borderClass}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PlugZap className="h-4 w-4 text-primary" />
            Testar Conexão com o Gateway Asaas
          </CardTitle>
          <Button onClick={runTest} disabled={status === "loading"} size="sm">
            {status === "loading" ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Testando…
              </>
            ) : (
              <>
                <PlugZap className="mr-1 h-3.5 w-3.5" /> Testar Conexão
              </>
            )}
          </Button>
        </div>
        <CardDescription className="text-xs">
          Invoca <code>pix-gateway</code> com{" "}
          <code>action: "test-connection"</code> e mostra o resultado real.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "idle" && (
          <p className="text-sm text-muted-foreground">
            Clique em "Testar Conexão" para validar credenciais, sandbox/produção
            e conectividade com a API Asaas.
          </p>
        )}

        {status !== "idle" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={
                  status === "ok"
                    ? "border-green-500/50 text-green-600"
                    : status === "error"
                      ? "border-red-500/50 text-red-600"
                      : "border-primary/40"
                }
              >
                {status === "ok" && (
                  <CheckCheck className="mr-1 h-3 w-3" />
                )}
                {status === "error" && <XCircle className="mr-1 h-3 w-3" />}
                {status === "loading" && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                {status === "ok"
                  ? "OK"
                  : status === "error"
                    ? "ERRO"
                    : "Aguardando…"}
              </Badge>
              {elapsed !== null && (
                <Badge variant="secondary" className="text-xs">
                  {elapsed} ms
                </Badge>
              )}
              {startedAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(startedAt).toLocaleTimeString()}
                </span>
              )}
            </div>

            {message && (
              <Alert
                className={
                  status === "ok"
                    ? "border-green-500/40 bg-green-500/5"
                    : "border-red-500/40 bg-red-500/5"
                }
              >
                <AlertDescription className="text-sm">
                  {message}
                </AlertDescription>
              </Alert>
            )}

            {Array.isArray(details?.checks) && details.checks.length > 0 && (
              <div className="space-y-1.5 rounded-md border bg-background/60 p-2">
                <div className="text-xs font-semibold text-muted-foreground">
                  Validação de credenciais ({details.checks.filter((c: any) => c.ok).length}/{details.checks.length} OK)
                </div>
                {details.checks.map((c: any) => (
                  <div key={c.field} className="flex items-start gap-2 text-xs">
                    {c.ok ? (
                      <CheckCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {c.label}
                        {c.masked && (
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {c.masked}
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {details?.account && (
              <div className="rounded-md border bg-background/60 p-2 text-xs">
                <div className="font-semibold">Conta Asaas reconhecida</div>
                <div className="text-muted-foreground">
                  {details.account.name || "—"} · {details.account.email || "—"}
                  {details.account.walletId && ` · wallet ${String(details.account.walletId).slice(0, 8)}…`}
                </div>
              </div>
            )}

            {details && (
              <details className="rounded-md border bg-muted/40 p-2">
                <summary className="cursor-pointer text-xs font-medium">
                  Ver JSON completo da resposta
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto text-xs">
                  {JSON.stringify(details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
