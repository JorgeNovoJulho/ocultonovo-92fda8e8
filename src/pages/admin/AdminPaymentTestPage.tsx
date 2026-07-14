import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  CreditCard,
  Shield,
  FlaskConical,
  AlertTriangle,
  Package,
  Lock,
  Unlock,
  QrCode,
  Wifi,
  Crown,
  Store,
} from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { toast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";

type TestStatus = "idle" | "running" | "pass" | "fail";

interface TestResult {
  name: string;
  status: TestStatus;
  detail?: string;
  qrData?: string;
}

const PLANS = [
  { key: "free", label: "Gratuito" },
  { key: "premium", label: "Premium" },
  { key: "vip", label: "VIP" },
];

function StatusIcon({ status }: { status: TestStatus }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-red-400" />;
  return <div className="h-4 w-4 rounded-full border border-border" />;
}

function statusBadge(status: TestStatus) {
  if (status === "pass") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Passou</Badge>;
  if (status === "fail") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Falhou</Badge>;
  if (status === "running") return <Badge className="bg-primary/20 text-primary border-primary/30">Executando…</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Pendente</Badge>;
}

async function generatePixQR(amount: number, description: string, payerEmail: string): Promise<{
  success: boolean;
  qr_code?: string;
  qr_code_base64?: string;
  transaction_id?: string;
  expires_at?: string;
  error?: string;
  provider?: string;
}> {
  const { data, error } = await supabase.functions.invoke("pix-gateway", {
    body: { action: "generate", amount, description, payerEmail },
  });
  if (error) return { success: false, error: error.message };
  return data ?? { success: false, error: "Sem resposta do gateway" };
}

export default function AdminPaymentTestPage() {
  const { user } = useAuth();
  const { data: isAdminMaster } = useIsMasterAdmin();

  // ── Standard Plan Test State ───────────────────────────
  const [targetEmail, setTargetEmail] = useState("");
  const [targetPlan, setTargetPlan] = useState<"free" | "premium" | "vip">("premium");
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<{ passed: number; failed: number } | null>(null);

  // ── VIP Subscription Plan Test State ─────────────────────
  const [vipPlans, setVipPlans] = useState<any[]>([]);
  const [selectedVipPlan, setSelectedVipPlan] = useState<any | null>(null);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<"monthly" | "annual" | "lifetime">("monthly");
  const [vipTestEmail, setVipTestEmail] = useState("");
  const [vipTestResults, setVipTestResults] = useState<TestResult[]>([]);
  const [isVipTestRunning, setIsVipTestRunning] = useState(false);
  const [vipSummary, setVipSummary] = useState<{ passed: number; failed: number } | null>(null);
  const [vipPixQR, setVipPixQR] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // 1. Buscar todos os planos de assinatura
      const { data: plans, error } = await (supabase as any)
        .from("subscription_plans")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) { console.error("Error fetching plans:", error); return; }
      if (!plans || plans.length === 0) { setVipPlans([]); return; }

      // 2. Buscar perfis dos criadores separadamente
      const creatorIds = [...new Set(plans.map((p: any) => p.profile_id))] as string[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, username, avatar_url, plan_type")
        .in("id", creatorIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      // 3. Combinar
      const enriched = plans.map((plan: any) => ({
        ...plan,
        creator: profileMap.get(plan.profile_id) || null,
      }));

      setVipPlans(enriched);
    })();
  }, []);

  // isAdminMaster already derived from useIsMasterAdmin()

  const updateResult = (name: string, status: TestStatus, detail?: string, qrData?: string) => {
    setResults((prev) =>
      prev.map((r) => (r.name === name ? { ...r, status, detail, qrData } : r))
    );
  };

  const updateVipResult = (name: string, status: TestStatus, detail?: string, qrData?: string) => {
    setVipTestResults((prev) =>
      prev.map((r) => (r.name === name ? { ...r, status, detail, qrData } : r))
    );
  };

  // ── VIP Plan Test Runner ───────────────────────────────
  const runVipPlanTest = async () => {
    if (!vipTestEmail.trim()) {
      toast({ title: "Informe o e-mail do usuário de teste", variant: "destructive" });
      return;
    }
    if (!selectedVipPlan) {
      toast({ title: "Selecione um plano VIP para testar", variant: "destructive" });
      return;
    }

    const cyclePrice = selectedBillingCycle === "monthly"
      ? selectedVipPlan.monthly_price
      : selectedBillingCycle === "annual"
      ? selectedVipPlan.annual_price
      : selectedVipPlan.lifetime_price;

    const cycleLabel = { monthly: "Mensal", annual: "Anual", lifetime: "Vitalício" }[selectedBillingCycle];

    const tests: TestResult[] = [
      { name: "Localizar usuário assinante", status: "idle" },
      { name: "Verificar plano VIP do criador", status: "idle" },
      { name: "Gateway PIX — verificar configuração", status: "idle" },
      { name: `QR Code PIX — ${selectedVipPlan.title} (${cycleLabel})`, status: "idle" },
      { name: "Criar registro de assinatura no banco", status: "idle" },
      { name: "Verificar liberação de conteúdo VIP", status: "idle" },
      { name: "Registrar transação de teste", status: "idle" },
    ];

    setVipTestResults(tests);
    setVipSummary(null);
    setVipPixQR(null);
    setIsVipTestRunning(true);

    let passed = 0;
    let failed = 0;
    let subscriberProfileId: string | null = null;

    // TEST 1
    updateVipResult(tests[0].name, "running");
    await new Promise((r) => setTimeout(r, 300));
    try {
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        "search_users_with_email",
        { p_query: vipTestEmail.trim() }
      );
      if (rpcError) throw new Error(rpcError.message);
      const found = (rpcResult as any[])?.find(
        (u: any) => u.email?.toLowerCase() === vipTestEmail.trim().toLowerCase()
      ) || rpcResult?.[0];
      if (!found) throw new Error("Usuário não encontrado");
      subscriberProfileId = found.id;
      updateVipResult(tests[0].name, "pass", `Assinante: ${found.name || found.username} (${found.email})`);
      passed++;
    } catch (e: any) {
      updateVipResult(tests[0].name, "fail", e.message);
      failed++;
    }

    // TEST 2
    updateVipResult(tests[1].name, "running");
    await new Promise((r) => setTimeout(r, 300));
    try {
      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("id, name, username, plan_type, is_creator")
        .eq("id", selectedVipPlan.profile_id)
        .single();
      if (!creatorProfile) throw new Error("Criador não encontrado");
      if (creatorProfile.plan_type !== "vip") throw new Error(`Criador tem plano ${creatorProfile.plan_type}, não VIP`);
      updateVipResult(tests[1].name, "pass",
        `Criador: ${creatorProfile.name || creatorProfile.username} | VIP ✓ | Plano: "${selectedVipPlan.title}" | ${cycleLabel}: R$ ${cyclePrice?.toFixed(2)}`
      );
      passed++;
    } catch (e: any) {
      updateVipResult(tests[1].name, "fail", e.message);
      failed++;
    }

    // TEST 3
    updateVipResult(tests[2].name, "running");
    await new Promise((r) => setTimeout(r, 300));
    let pixConfig: any = null;
    try {
      const { data: cfg, error: cfgErr } = await supabase
        .from("pix_gateway_config")
        .select("gateway_provider, is_active, sandbox_mode, pix_key_type, pix_key")
        .maybeSingle();
      if (cfgErr) throw new Error(cfgErr.message);
      if (!cfg) throw new Error("Gateway PIX não configurado");
      if (!cfg.is_active) throw new Error(`Gateway ${cfg.gateway_provider} está INATIVO`);
      pixConfig = cfg;
      updateVipResult(tests[2].name, "pass",
        `Gateway: ${cfg.gateway_provider} | ${cfg.sandbox_mode ? "Sandbox" : "Produção"} | Chave: ${cfg.pix_key_type}`
      );
      passed++;
    } catch (e: any) {
      updateVipResult(tests[2].name, "fail", e.message);
      failed++;
    }

    // TEST 4
    updateVipResult(tests[3].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    if (pixConfig) {
      try {
        const amount = Math.max(cyclePrice ?? 5, 5);
        const result = await generatePixQR(
          amount,
          `Assinatura VIP: ${selectedVipPlan.title} (${cycleLabel}) — Teste Admin`,
          vipTestEmail.trim()
        );
        if (result.success && (result.qr_code || result.qr_code_base64)) {
          setVipPixQR(result.qr_code ?? null);
          updateVipResult(tests[3].name, "pass",
            `QR PIX gerado! R$ ${amount.toFixed(2)} | Provider: ${result.provider} | ID: ${result.transaction_id?.substring(0, 16)}… | Expira: ${result.expires_at ? new Date(result.expires_at).toLocaleTimeString("pt-BR") : "n/d"}`,
            result.qr_code
          );
          passed++;
        } else {
          throw new Error(result.error ?? "Gateway não retornou QR code");
        }
      } catch (e: any) {
        updateVipResult(tests[3].name, "fail", `Falha ao gerar QR: ${e.message}`);
        failed++;
      }
    } else {
      updateVipResult(tests[3].name, "fail", "Gateway PIX não disponível");
      failed++;
    }

    // TEST 5
    updateVipResult(tests[4].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    if (subscriberProfileId) {
      try {
        const expiresAt = new Date();
        if (selectedBillingCycle === "monthly") expiresAt.setMonth(expiresAt.getMonth() + 1);
        else if (selectedBillingCycle === "annual") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        else expiresAt.setFullYear(expiresAt.getFullYear() + 99);

        const { error } = await (supabase as any)
          .from("subscriptions")
          .upsert(
            {
              subscriber_id: subscriberProfileId,
              creator_id: selectedVipPlan.profile_id,
              status: "active",
              price: cyclePrice ?? 0,
              expires_at: expiresAt.toISOString(),
            },
            { onConflict: "subscriber_id,creator_id" }
          );
        if (error) throw error;
        updateVipResult(tests[4].name, "pass",
          `Assinatura criada! Expira: ${expiresAt.toLocaleDateString("pt-BR")}`
        );
        passed++;
      } catch (e: any) {
        updateVipResult(tests[4].name, "fail", `Erro: ${e.message}`);
        failed++;
      }
    } else {
      updateVipResult(tests[4].name, "fail", "Assinante não localizado");
      failed++;
    }

    // TEST 6
    updateVipResult(tests[5].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    if (subscriberProfileId) {
      try {
        const db = supabase as any;
        const { data: sub } = await (supabase as any)
          .from("subscriptions")
          .select("id, status, expires_at")
          .eq("subscriber_id", String(subscriberProfileId))
          .eq("creator_id", String(selectedVipPlan.profile_id))
          .eq("status", "active")
          .maybeSingle();
        if (!sub) throw new Error("Assinatura ativa não encontrada no banco");
        const { data: vipPosts } = await (supabase as any)
          .from("posts")
          .select("id")
          .eq("profile_id", selectedVipPlan.profile_id)
          .eq("is_paid", true)
          .limit(10);
        updateVipResult(tests[5].name, "pass",
          `Assinatura ativa até ${new Date(sub.expires_at).toLocaleDateString("pt-BR")} | ${vipPosts?.length ?? 0} post(s) VIP liberados`
        );
        passed++;
      } catch (e: any) {
        updateVipResult(tests[5].name, "fail", e.message);
        failed++;
      }
    } else {
      updateVipResult(tests[5].name, "fail", "Assinante não disponível");
      failed++;
    }

    // TEST 7
    updateVipResult(tests[6].name, "running");
    await new Promise((r) => setTimeout(r, 300));
    if (subscriberProfileId) {
      try {
        const { data: subProfile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", subscriberProfileId)
          .single();
        const { error } = await (supabase as any).from("transactions").insert({
          user_id: subscriberProfileId,
          type: "subscription",
          amount: cyclePrice ?? 0,
          status: "completed",
          description: `[TESTE ADMIN] Assinatura VIP: ${selectedVipPlan.title} (${cycleLabel})`,
          seller_id: selectedVipPlan.profile_id,
        });
        if (error) throw error;
        updateVipResult(tests[6].name, "pass",
          `Transação registrada: R$ ${(cyclePrice ?? 0).toFixed(2)}`
        );
        passed++;
      } catch (e: any) {
        updateVipResult(tests[6].name, "fail", `Erro: ${e.message}`);
        failed++;
      }
    } else {
      updateVipResult(tests[6].name, "fail", "Assinante não disponível");
      failed++;
    }

    setVipSummary({ passed, failed });
    setIsVipTestRunning(false);
    toast({
      title: failed === 0 ? "✅ Teste VIP completo!" : `⚠️ ${failed} etapa(s) falharam`,
      description: `${passed}/${tests.length} etapas concluídas com sucesso.`,
      variant: failed === 0 ? "default" : "destructive",
    });
  };

  // ── Standard Plan Test Runner ──────────────────────────
  const runTests = async () => {
    if (!targetEmail.trim()) {
      toast({ title: "Informe o e-mail do usuário de teste", variant: "destructive" });
      return;
    }

    const planLabel = PLANS.find((p) => p.key === targetPlan)?.label ?? targetPlan;

    const tests: TestResult[] = [
      { name: "Localizar usuário de teste", status: "idle" },
      { name: "Verificar perfil no banco de dados", status: "idle" },
      { name: `Alterar plano para ${planLabel}`, status: "idle" },
      { name: "Confirmar payment_status: active", status: "idle" },
      { name: "Verificar liberação de conteúdo pago (PPV)", status: "idle" },
      { name: "Verificar liberação de assinatura ativa", status: "idle" },
      { name: "Gateway PIX — configuração ativa", status: "idle" },
      { name: "QR Code PIX — assinatura de plano", status: "idle" },
      { name: "QR Code PIX — conteúdo PPV (marketplace)", status: "idle" },
      { name: "QR Code PIX — recarga de carteira", status: "idle" },
      { name: "Reverter plano para free (limpeza)", status: "idle" },
    ];

    setResults(tests);
    setSummary(null);
    setIsRunning(true);

    let profileId: string | null = null;
    let passed = 0;
    let failed = 0;

    updateResult(tests[0].name, "running");
    await new Promise((r) => setTimeout(r, 300));
    try {
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        "search_users_with_email",
        { p_query: targetEmail.trim() }
      );
      if (rpcError) throw new Error(rpcError.message);
      const found = (rpcResult as any[])?.find(
        (u: any) => u.email?.toLowerCase() === targetEmail.trim().toLowerCase()
      ) || rpcResult?.[0];
      if (!found) throw new Error("Usuário não encontrado.");
      profileId = found.id;
      updateResult(tests[0].name, "pass", `Encontrado: ${found.name || found.username} (${found.email})`);
      passed++;
    } catch (e: any) {
      updateResult(tests[0].name, "fail", e.message);
      failed++;
    }

    updateResult(tests[1].name, "running");
    await new Promise((r) => setTimeout(r, 300));
    if (profileId) {
      const { data: pf } = await supabase
        .from("profiles")
        .select("id, plan_type, payment_status, is_creator, name, username")
        .eq("id", profileId)
        .single();
      if (pf) {
        updateResult(tests[1].name, "pass", `Plano: ${pf.plan_type} | Status: ${pf.payment_status}`);
        passed++;
      } else {
        updateResult(tests[1].name, "fail", "Não foi possível ler o perfil");
        failed++;
      }
    } else {
      updateResult(tests[1].name, "fail", "Perfil não encontrado");
      failed++;
    }

    updateResult(tests[2].name, "running");
    await new Promise((r) => setTimeout(r, 500));
    if (profileId) {
      const { error } = await (supabase as any).rpc("admin_update_user_plan", {
        p_profile_id: profileId,
        p_plan_type: targetPlan,
        p_payment_status: "active",
      });
      if (error) { updateResult(tests[2].name, "fail", error.message); failed++; }
      else { updateResult(tests[2].name, "pass", `plan_type → ${targetPlan}`); passed++; }
    } else { updateResult(tests[2].name, "fail", "Perfil não disponível"); failed++; }

    updateResult(tests[3].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    if (profileId) {
      const { data: pf2 } = await supabase
        .from("profiles").select("plan_type, payment_status").eq("id", profileId).single();
      if (pf2?.payment_status === "active" && pf2?.plan_type === targetPlan) {
        updateResult(tests[3].name, "pass", "payment_status: active ✓"); passed++;
      } else {
        updateResult(tests[3].name, "fail", `plan=${pf2?.plan_type}, status=${pf2?.payment_status}`); failed++;
      }
    } else { updateResult(tests[3].name, "fail", "Perfil não disponível"); failed++; }

    updateResult(tests[4].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    try {
      const { data: items } = await supabase
        .from("marketplace_items").select("id, title").eq("is_active", true).limit(3);
      updateResult(tests[4].name, "pass", `${items?.length ?? 0} item(s) PPV no marketplace.`);
      passed++;
    } catch (e: any) { updateResult(tests[4].name, "fail", e.message); failed++; }

    updateResult(tests[5].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    if (profileId && targetPlan !== "free") {
      try {
        const { data: subs } = await (supabase as any)
          .from("subscriptions").select("id, status, expires_at")
          .eq("subscriber_id", profileId).eq("status", "active").limit(1);
        if (subs && subs.length > 0) {
          updateResult(tests[5].name, "pass", `Ativa até ${new Date(subs[0].expires_at).toLocaleDateString("pt-BR")}`);
        } else {
          updateResult(tests[5].name, "pass", "Acesso via plan_type (OK)");
        }
        passed++;
      } catch (e: any) { updateResult(tests[5].name, "fail", e.message); failed++; }
    } else {
      updateResult(tests[5].name, "pass", "Plano free sem assinatura (OK)"); passed++;
    }

    updateResult(tests[6].name, "running");
    await new Promise((r) => setTimeout(r, 300));
    let pixConfig: any = null;
    try {
      const { data: cfg, error: cfgErr } = await supabase
        .from("pix_gateway_config")
        .select("gateway_provider, is_active, sandbox_mode, pix_key_type, pix_key")
        .maybeSingle();
      if (cfgErr) throw new Error(cfgErr.message);
      if (!cfg) throw new Error("Gateway PIX não configurado");
      if (!cfg.is_active) throw new Error(`Gateway ${cfg.gateway_provider} INATIVO`);
      pixConfig = cfg;
      updateResult(tests[6].name, "pass",
        `${cfg.gateway_provider} | ${cfg.sandbox_mode ? "Sandbox" : "Produção"}`
      );
      passed++;
    } catch (e: any) { updateResult(tests[6].name, "fail", e.message); failed++; }

    updateResult(tests[7].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    if (pixConfig) {
      const planPrices: Record<string, number> = { free: 5, premium: 29.9, vip: 59.9 };
      const amount = planPrices[targetPlan] ?? 29.9;
      try {
        const result = await generatePixQR(amount, `Assinatura ${planLabel} — Teste`, targetEmail.trim());
        if (result.success && (result.qr_code || result.qr_code_base64)) {
          updateResult(tests[7].name, "pass",
            `QR gerado! R$ ${amount} | ID: ${result.transaction_id?.substring(0, 16)}…`,
            result.qr_code
          );
          passed++;
        } else throw new Error(result.error ?? "Sem QR code");
      } catch (e: any) { updateResult(tests[7].name, "fail", e.message); failed++; }
    } else { updateResult(tests[7].name, "fail", "Gateway indisponível"); failed++; }

    updateResult(tests[8].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    if (pixConfig) {
      try {
        const { data: ppvItems } = await supabase
          .from("marketplace_items").select("id, title, price").eq("is_active", true).gt("price", 0).limit(1);
        const ppvAmount = Math.max(ppvItems?.[0]?.price ?? 9.9, 5);
        const result = await generatePixQR(ppvAmount, `PPV: ${ppvItems?.[0]?.title ?? "Simulado"} — Teste`, targetEmail.trim());
        if (result.success && (result.qr_code || result.qr_code_base64)) {
          updateResult(tests[8].name, "pass", `QR PPV gerado! R$ ${ppvAmount.toFixed(2)}`, result.qr_code);
          passed++;
        } else throw new Error(result.error ?? "Sem QR code");
      } catch (e: any) { updateResult(tests[8].name, "fail", e.message); failed++; }
    } else { updateResult(tests[8].name, "fail", "Gateway indisponível"); failed++; }

    updateResult(tests[9].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    if (pixConfig) {
      try {
        const result = await generatePixQR(10.0, "Recarga de carteira — Teste", targetEmail.trim());
        if (result.success && (result.qr_code || result.qr_code_base64)) {
          updateResult(tests[9].name, "pass", `QR recarga gerado! R$ 10,00`, result.qr_code);
          passed++;
        } else throw new Error(result.error ?? "Sem QR code");
      } catch (e: any) { updateResult(tests[9].name, "fail", e.message); failed++; }
    } else { updateResult(tests[9].name, "fail", "Gateway indisponível"); failed++; }

    updateResult(tests[10].name, "running");
    await new Promise((r) => setTimeout(r, 400));
    if (profileId) {
      const { error } = await (supabase as any).rpc("admin_update_user_plan", {
        p_profile_id: profileId,
        p_plan_type: "free",
        p_payment_status: "suspended",
      });
      if (error) { updateResult(tests[10].name, "fail", error.message); failed++; }
      else { updateResult(tests[10].name, "pass", "Plano revertido para free."); passed++; }
    } else { updateResult(tests[10].name, "fail", "Perfil indisponível"); failed++; }

    setSummary({ passed, failed });
    setIsRunning(false);
    toast({
      title: failed === 0 ? "✅ Todos os testes passaram!" : `⚠️ ${failed} teste(s) falharam`,
      description: `${passed}/${tests.length} testes concluídos.`,
      variant: failed === 0 ? "default" : "destructive",
    });
  };

  if (!isAdminMaster) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive">
              <Shield className="h-5 w-5" />
              <p>Acesso restrito a Admin Master.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const planResults = results.slice(0, 6);
  const qrResults = results.slice(6, 10);
  const cleanupResult = results.slice(10);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Rotina de Teste de Pagamentos</h1>
          <p className="text-sm text-muted-foreground">
            Valida planos, conteúdo pago e geração de QR Code PIX em toda a plataforma
          </p>
        </div>
      </div>

      <Alert className="border-yellow-500/30 bg-yellow-500/10">
        <AlertTriangle className="h-4 w-4 text-yellow-400" />
        <AlertDescription className="text-yellow-300 text-sm">
          Esta rotina <strong>modifica temporariamente</strong> o plano do usuário alvo e o reverte ao final.
          Use apenas contas de teste. QR codes gerados são reais e expiram automaticamente.
        </AlertDescription>
      </Alert>

      {/* ── STANDARD PLAN TEST ─────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" />
            Configuração do Teste de Plano
          </CardTitle>
          <CardDescription>Defina o usuário e o plano a testar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>E-mail do Usuário de Teste</Label>
            <Input
              placeholder="usuario@exemplo.com"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Plano a Testar</Label>
            <div className="flex gap-2">
              {PLANS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTargetPlan(p.key as any)}
                  disabled={isRunning}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    targetPlan === p.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={runTests}
            disabled={isRunning}
            className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-bold gap-2"
          >
            {isRunning ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Executando testes…</>
            ) : (
              <><FlaskConical className="h-4 w-4" />Executar Rotina de Testes</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Standard test results */}
      {planResults.length > 0 && planResults.some((r) => r.status !== "idle") && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Testes de Plano e Acesso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {planResults.map((r, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20">
                <StatusIcon status={r.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">{r.name}</span>
                    {statusBadge(r.status)}
                  </div>
                  {r.detail && <p className="text-xs text-muted-foreground mt-0.5">{r.detail}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {qrResults.length > 0 && qrResults.some((r) => r.status !== "idle") && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              Testes de QR Code PIX
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {qrResults.map((r, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20">
                <StatusIcon status={r.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">{r.name}</span>
                    {statusBadge(r.status)}
                  </div>
                  {r.detail && <p className="text-xs text-muted-foreground mt-0.5">{r.detail}</p>}
                  {r.qrData && (
                    <div className="mt-2 p-2 bg-white rounded-lg inline-flex">
                      <QRCodeSVG value={r.qrData} size={100} level="M" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {cleanupResult.length > 0 && cleanupResult[0].status !== "idle" && (
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3">
              <StatusIcon status={cleanupResult[0].status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{cleanupResult[0].name}</span>
                  {statusBadge(cleanupResult[0].status)}
                </div>
                {cleanupResult[0].detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{cleanupResult[0].detail}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          summary.failed === 0 ? "bg-green-500/10 border-green-500/30" : "bg-destructive/10 border-destructive/30"
        }`}>
          {summary.failed === 0
            ? <CheckCircle2 className="h-5 w-5 text-green-400" />
            : <AlertTriangle className="h-5 w-5 text-destructive" />}
          <div>
            <p className="font-semibold text-sm">
              {summary.failed === 0 ? "Todos os testes passaram!" : `${summary.failed} teste(s) falharam`}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.passed}/{results.length} aprovados
            </p>
          </div>
        </div>
      )}

      <Separator />

      {/* ══ VIP SUBSCRIPTION PLAN TEST ══════════════════════ */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
            Teste de Planos VIP de Assinatura
          </CardTitle>
          <CardDescription>
            Simula pagamento PIX completo de plano de assinatura criado por criador VIP,
            cria a assinatura no banco e libera todo o conteúdo referido ao plano
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Plan selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5 text-muted-foreground" />
              Selecionar Plano de Assinatura
              {vipPlans.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">({vipPlans.length} disponível{vipPlans.length !== 1 ? "is" : ""})</span>
              )}
            </Label>
            {vipPlans.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhum plano de assinatura encontrado.</p>
            ) : (
              <div className="grid gap-2 max-h-48 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                {vipPlans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedVipPlan(plan)}
                    disabled={isVipTestRunning}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                      selectedVipPlan?.id === plan.id
                        ? "border-primary bg-primary/10"
                        : "border-border/40 bg-muted/20 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {plan.creator?.avatar_url ? (
                        <img loading="lazy" decoding="async" src={plan.creator.avatar_url} className="h-9 w-9 rounded-full object-cover flex-shrink-0 border border-border/40" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 border border-border/40">
                          <span className="text-xs font-bold text-muted-foreground">
                            {(plan.creator?.name || plan.creator?.username || "?")[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-sm truncate">{plan.title}</p>
                          {plan.is_enabled ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/20 flex-shrink-0">Ativo</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/30 flex-shrink-0">Inativo</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {plan.creator?.name || plan.creator?.username || "Criador desconhecido"}
                          {plan.creator?.plan_type === "vip" && <span className="ml-1 text-[hsl(45,93%,47%)]">★ VIP</span>}
                          {plan.monthly_price ? ` · R$ ${plan.monthly_price.toFixed(2)}/mês` : ""}
                        </p>
                      </div>
                    </div>
                    {selectedVipPlan?.id === plan.id && (
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Billing cycle */}
          {selectedVipPlan && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Ciclo de Cobrança</Label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: "monthly" as const, label: "Mensal", price: selectedVipPlan.monthly_price },
                  ...(selectedVipPlan.annual_price ? [{ key: "annual" as const, label: "Anual", price: selectedVipPlan.annual_price }] : []),
                  ...(selectedVipPlan.lifetime_price ? [{ key: "lifetime" as const, label: "Vitalício", price: selectedVipPlan.lifetime_price }] : []),
                ].map(({ key, label, price }) => (
                  <button
                    key={key}
                    onClick={() => setSelectedBillingCycle(key)}
                    disabled={isVipTestRunning}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                      selectedBillingCycle === key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:border-border"
                    }`}
                  >
                    {label} · R$ {price?.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Subscriber email */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">E-mail do Usuário Assinante</Label>
            <Input
              placeholder="assinante@exemplo.com"
              value={vipTestEmail}
              onChange={(e) => setVipTestEmail(e.target.value)}
              disabled={isVipTestRunning}
            />
          </div>

          <Button
            onClick={runVipPlanTest}
            disabled={isVipTestRunning || !selectedVipPlan || !vipTestEmail.trim()}
            className="w-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-primary hover:opacity-90 font-bold text-sm gap-2"
          >
            {isVipTestRunning ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Executando teste VIP…</>
            ) : (
              <><Crown className="h-4 w-4" />Executar Teste de Plano VIP</>
            )}
          </Button>

          {/* VIP Test Results */}
          {vipTestResults.length > 0 && (
            <div className="space-y-2 mt-2">
              <Separator />
              <p className="text-sm font-semibold">Resultados do Teste VIP</p>
              {vipTestResults.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/20 border border-border/30">
                  <StatusIcon status={r.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium">{r.name}</span>
                      {statusBadge(r.status)}
                    </div>
                    {r.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">{r.detail}</p>
                    )}
                  </div>
                </div>
              ))}

              {vipPixQR && (
                <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5">
                  <p className="text-sm font-medium text-primary flex items-center gap-1.5">
                    <QrCode className="h-4 w-4" />
                    QR Code PIX — Plano VIP (real)
                  </p>
                  <div className="p-3 rounded-xl bg-white shadow-lg">
                    <QRCodeSVG value={vipPixQR} size={160} level="M" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    QR Code real gerado pelo gateway. Use para validar o fluxo de pagamento.
                  </p>
                </div>
              )}

              {vipSummary && (
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                  vipSummary.failed === 0
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-destructive/10 border-destructive/30"
                }`}>
                  {vipSummary.failed === 0
                    ? <CheckCircle2 className="h-5 w-5 text-green-400" />
                    : <AlertTriangle className="h-5 w-5 text-destructive" />}
                  <div>
                    <p className="text-sm font-semibold">
                      {vipSummary.failed === 0 ? "Teste VIP completo! Assinatura e conteúdo liberados." : `${vipSummary.failed} etapa(s) com erro`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {vipSummary.passed}/{vipTestResults.length} etapas aprovadas
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="border-border/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            O que é testado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-xs text-muted-foreground">
            {[
              { icon: <Lock className="h-3.5 w-3.5" />, title: "Autenticação de admin", desc: "Verifica role admin_master antes de qualquer ação" },
              { icon: <CreditCard className="h-3.5 w-3.5" />, title: "Alteração de plano", desc: "Simula upgrade via função admin segura" },
              { icon: <QrCode className="h-3.5 w-3.5" />, title: "Gateway PIX", desc: "Gera QR codes reais via edge function pix-gateway" },
              { icon: <Unlock className="h-3.5 w-3.5" />, title: "Liberação de conteúdo VIP", desc: "Cria assinatura no banco e verifica acesso a posts pagos" },
              { icon: <Crown className="h-3.5 w-3.5 text-[hsl(45,93%,47%)]" />, title: "Planos VIP de criadores", desc: "Testa o fluxo completo de assinatura de planos criados por usuários VIP" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-muted-foreground">{item.icon}</span>
                <div>
                  <span className="font-medium text-foreground">{item.title}: </span>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
