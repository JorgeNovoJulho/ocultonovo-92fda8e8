import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, EXTERNAL_ANON_KEY, EXTERNAL_URL } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Zap,
  CreditCard,
  QrCode,
  Mail,
  Bell,
  MessageCircle,
  Video,
  MessageSquare,
  Globe,
  Shield,
  Activity,
  Loader2,
  ChevronDown,
  Eye,
  EyeOff,
  Save,
  TestTube,
  BrainCircuit,
  Clock3,
  Trash2,
} from "lucide-react";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { toast } from "@/hooks/use-toast";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

// ─── Types ────────────────────────────────────────────────────────────────────
interface IntegrationStatus {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  status: "ok" | "warning" | "error" | "loading";
  detail: string;
  adminPath?: string;
  docsUrl?: string;
  required: boolean;
  canTest?: boolean;
  canEdit?: boolean;
  lastTestAt?: string | null;
  lastTestStatus?: "OK" | "FAIL" | null;
  lastTestMessage?: string | null;
  referenceState?: "validated" | "referenced" | "missing";
}

interface IntegrationHistoryEntry {
  serviceId: string;
  serviceLabel: string;
  status: "OK" | "FAIL";
  message: string;
  testedAt: string;
}

interface IntegrationDebugInfo {
  clientLabel: string;
  apiBase: string;
  userId: string | null;
  userEmail: string | null;
  jwtRole: string | null;
  database: string | null;
  primaryAction: "insert" | "update";
  fallbackAction: "insert" | "update";
  policies: Array<{
    table: string;
    policy: string;
    command: string;
    roles: string[];
    using: string | null;
    with_check: string | null;
  }>;
}

interface SaveSettingResult {
  targetTable: "system_settings" | "oculto_admin_settings_fallback";
  mode: "insert" | "update";
  usedFallback: boolean;
  primaryErrorMessage?: string;
  debugInfo: IntegrationDebugInfo | null;
}

const normalizeSettingValue = (value: unknown) => {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.replace(/^"|"$/g, "");
  return value == null ? "" : String(value).replace(/^"|"$/g, "");
};

const isTruthySetting = (value: unknown) =>
  normalizeSettingValue(value) === "true";

const extractErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error || "");
  try {
    const parsed = JSON.parse(raw);
    return parsed?.message || parsed?.error || raw;
  } catch {
    return raw;
  }
};

const isPermissionDenied42501 = (error: unknown) => {
  const message = extractErrorMessage(error);
  return /42501|permission denied|row-level security/i.test(message);
};

async function fetchSettingsRows(options?: { keys?: string[]; like?: string }) {
  const applyFilters = (query: any, keyColumn: string) => {
    if (options?.keys?.length) query = query.in(keyColumn, options.keys);
    if (options?.like) query = query.like(keyColumn, options.like);
    return query;
  };

  const [primaryResult, fallbackResult] = await Promise.all([
    applyFilters(
      (supabase as any).from("system_settings").select("key, value, description"),
      "key",
    ),
    applyFilters(
      (supabase as any)
        .from("oculto_admin_settings_fallback")
        .select("key, value, description"),
      "key",
    ).catch(() => ({ data: [], error: null })),
  ]);

  if (primaryResult.error) throw primaryResult.error;

  const merged = new Map<string, any>();
  for (const row of primaryResult.data || []) merged.set(row.key, row);
  for (const row of fallbackResult.data || []) {
    if (!merged.has(row.key)) merged.set(row.key, row);
  }

  return Array.from(merged.values());
}

async function getIntegrationDebugInfo(
  key: string,
): Promise<IntegrationDebugInfo | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data } = await (supabase as any)
    .rpc("debug_integration_settings_context", { p_key: key })
    .then((result: any) => result)
    .catch(() => ({ data: null }));

  return {
    clientLabel: "supabaseExternal.ts",
    apiBase: EXTERNAL_URL,
    userId: session?.user?.id ?? null,
    userEmail: session?.user?.email ?? null,
    jwtRole: data?.jwt_role ?? session?.user?.role ?? "authenticated",
    database: data?.database ?? null,
    primaryAction:
      data?.system_settings_action === "update" ? "update" : "insert",
    fallbackAction: data?.fallback_action === "update" ? "update" : "insert",
    policies: Array.isArray(data?.policies) ? data.policies : [],
  };
}

async function writeSettingRecord(
  table: "system_settings" | "oculto_admin_settings_fallback",
  key: string,
  value: string,
  description: string,
  mode: "insert" | "update",
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const endpoint =
    mode === "update"
      ? `${EXTERNAL_URL}/rest/v1/${table}?key=eq.${encodeURIComponent(key)}`
      : `${EXTERNAL_URL}/rest/v1/${table}`;

  const payload =
    mode === "update"
      ? {
          value,
          description,
          updated_at: new Date().toISOString(),
        }
      : {
          key,
          value,
          description,
          mirrored_from: "system_settings",
          updated_at: new Date().toISOString(),
        };

  const response = await fetch(endpoint, {
    method: mode === "update" ? "PATCH" : "POST",
    headers: {
      apikey: EXTERNAL_ANON_KEY,
      Authorization: `Bearer ${session?.access_token || EXTERNAL_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function upsertSystemSetting(
  key: string,
  value: string,
  description: string,
): Promise<SaveSettingResult> {
  const [rows, debugInfo] = await Promise.all([
    fetchSettingsRows({ keys: [key] }),
    getIntegrationDebugInfo(key),
  ]);

  const primaryExists = rows.some((row) => row.key === key);

  try {
    await writeSettingRecord(
      "system_settings",
      key,
      value,
      description,
      primaryExists ? "update" : "insert",
    );

    return {
      targetTable: "system_settings",
      mode: primaryExists ? "update" : "insert",
      usedFallback: false,
      debugInfo,
    };
  } catch (error) {
    if (!isPermissionDenied42501(error)) throw error;

    const fallbackRows = await fetchSettingsRows({ keys: [key] });
    const fallbackExists = fallbackRows.some((row) => row.key === key);

    await writeSettingRecord(
      "oculto_admin_settings_fallback",
      key,
      value,
      description,
      fallbackExists ? "update" : "insert",
    );

    return {
      targetTable: "oculto_admin_settings_fallback",
      mode: fallbackExists ? "update" : "insert",
      usedFallback: true,
      primaryErrorMessage: extractErrorMessage(error),
      debugInfo,
    };
  }
}

const SERVICE_LABELS: Record<string, string> = {
  supabase: "Backend (Cloud)",
  openstreetmap: "Mapas (OpenStreetMap)",
  openai: "OpenAI",
  pix: "Gateway PIX",
  resend: "Resend (Email)",
  whatsapp: "WhatsApp",
  vapid: "Notificações Push (VAPID)",
  cloudflare: "Cloudflare Stream",
  discord: "Discord Webhook",
  asaas: "ASAAS — PIX, Cartão & Saques",
};

const getServiceHealth = (settings: Record<string, string>, id: string) => ({
  status: (settings[`${id}_last_test_status`] === "OK" ||
  settings[`${id}_last_test_status`] === "FAIL"
    ? settings[`${id}_last_test_status`]
    : null) as "OK" | "FAIL" | null,
  message: settings[`${id}_last_test_message`] || null,
  at: settings[`${id}_last_test_at`] || null,
  referenced:
    isTruthySetting(settings[`${id}_configured`]) ||
    settings[`${id}_reference_status`] === "referenced",
});

const mergePersistedHealth = (
  id: string,
  fallbackStatus: IntegrationStatus["status"],
  fallbackDetail: string,
  settings: Record<string, string>,
): Pick<
  IntegrationStatus,
  | "status"
  | "detail"
  | "lastTestAt"
  | "lastTestStatus"
  | "lastTestMessage"
  | "referenceState"
> => {
  const health = getServiceHealth(settings, id);
  if (health.status === "OK") {
    return {
      status: "ok",
      detail: health.message || fallbackDetail,
      lastTestAt: health.at,
      lastTestStatus: "OK",
      lastTestMessage: health.message,
      referenceState: "validated",
    };
  }
  if (health.status === "FAIL") {
    return {
      status: "error",
      detail: health.message || fallbackDetail,
      lastTestAt: health.at,
      lastTestStatus: "FAIL",
      lastTestMessage: health.message,
      referenceState: health.referenced ? "referenced" : "missing",
    };
  }
  if (health.referenced && fallbackStatus === "error") {
    return {
      status: "warning",
      detail: `Referência salva — execute o teste para validar. ${fallbackDetail}`,
      lastTestAt: health.at,
      lastTestStatus: null,
      lastTestMessage: health.message,
      referenceState: "referenced",
    };
  }
  return {
    status: fallbackStatus,
    detail: fallbackDetail,
    lastTestAt: health.at,
    lastTestStatus: null,
    lastTestMessage: health.message,
    referenceState: health.referenced ? "referenced" : "missing",
  };
};

// ─── Data fetcher ────────────────────────────────────────────────────────────
async function fetchIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const safe = async <T,>(p: Promise<T>, label: string): Promise<T | null> => {
    try {
      return await p;
    } catch (err) {
      console.warn(`[integrations] falha ao carregar ${label}:`, err);
      return null;
    }
  };

  const [
    systemSettings,
    pixRes,
    resendRes,
    whatsappRes,
  ] = await Promise.all([
    safe(fetchSettingsRows(), "system_settings"),
    safe(
      (supabase as any)
        .from("pix_gateway_config")
        .select("gateway_provider, api_key_encrypted, is_active, sandbox_mode")
        .maybeSingle(),
      "pix_gateway_config",
    ),
    safe(
      (supabase as any)
        .from("resend_config")
        .select("api_key_encrypted, is_active, sandbox_mode, from_email")
        .maybeSingle(),
      "resend_config",
    ),
    safe(
      (supabase as any)
        .from("whatsapp_config")
        .select("provider, api_key_encrypted, is_active, sandbox_mode")
        .maybeSingle(),
      "whatsapp_config",
    ),
  ]);

  const pixConfig = (pixRes as any)?.data ?? null;
  const resendConfig = (resendRes as any)?.data ?? null;
  const whatsappConfig = (whatsappRes as any)?.data ?? null;

  const settings: Record<string, string> = {};
  (systemSettings || []).forEach((s: any) => {
    settings[s.key] = normalizeSettingValue(s.value);
  });

  const pix = pixConfig as any;
  const resend = resendConfig as any;
  const wa = whatsappConfig as any;

  const vapidEnabled = settings["vapid_enabled"] === "true";
  const vapidPublic = settings["vapid_public_key"];
  const vapidPrivate = settings["vapid_private_key"];
  const openaiConfigured =
    settings["openai_configured"] === "true" ||
    settings["openai_last_test_status"] === "OK";

  const pixConfigured =
    pix?.api_key_encrypted && pix.api_key_encrypted.length > 5;
  const resendConfigured =
    resend?.api_key_encrypted &&
    resend.api_key_encrypted.length > 5 &&
    !resend.api_key_encrypted.includes("placeholder");
  const waConfigured = wa?.api_key_encrypted && wa.api_key_encrypted.length > 5;

  const baseItems: IntegrationStatus[] = [
    {
      id: "supabase",
      label: "Backend (Cloud)",
      description: "Auth, banco de dados, storage e realtime",
      icon: Shield,
      status: "ok",
      detail: "Conectado e operacional",
      required: true,
    },
    {
      id: "openstreetmap",
      label: "Mapas (OpenStreetMap)",
      description: "Radar, geocoding reverso e CEP lookup",
      icon: Globe,
      status: "ok",
      detail: "API pública gratuita — sem chave necessária",
      docsUrl: "https://www.openstreetmap.org/",
      required: true,
    },
    {
      id: "openai",
      label: "OpenAI",
      description: "GPT-4o — IA para chat, análise e automações",
      icon: BrainCircuit,
      status: openaiConfigured ? "ok" : "warning",
      detail: openaiConfigured
        ? settings["openai_last_test_message"] || "OpenAI API operacional ✅"
        : "Clique em 'Testar' para validar a OPENAI_API_KEY",
      docsUrl: "https://platform.openai.com/api-keys",
      required: false,
      canTest: true,
      canEdit: true,
      ...mergePersistedHealth(
        "openai",
        openaiConfigured ? "ok" : "warning",
        openaiConfigured
          ? settings["openai_last_test_message"] || "OpenAI API operacional ✅"
          : "Clique em 'Testar' para validar a OPENAI_API_KEY",
        settings,
      ),
    },
    {
      id: "pix",
      label: `Gateway PIX (${pix?.gateway_provider ? pix.gateway_provider.charAt(0).toUpperCase() + pix.gateway_provider.slice(1) : "não definido"})`,
      description: "Pagamentos PIX com split automático",
      icon: QrCode,
      status: pixConfigured ? (pix?.is_active ? "ok" : "warning") : "error",
      detail: pixConfigured
        ? pix?.is_active
          ? pix?.sandbox_mode
            ? `✅ Configurado — modo SANDBOX | Webhook: ${EXTERNAL_SUPABASE_URL}/functions/v1/pix-webhook`
            : `✅ Configurado — PRODUÇÃO | Webhook: ${EXTERNAL_SUPABASE_URL}/functions/v1/pix-webhook`
          : "⚠️ Configurado mas INATIVO"
        : "❌ API Key não configurada",
      adminPath: "/admin/pix",
      required: true,
      canTest: true,
      ...mergePersistedHealth(
        "pix",
        pixConfigured ? (pix?.is_active ? "ok" : "warning") : "error",
        pixConfigured
          ? pix?.is_active
            ? pix?.sandbox_mode
              ? `✅ Configurado — modo SANDBOX | Webhook: ${EXTERNAL_SUPABASE_URL}/functions/v1/pix-webhook`
              : `✅ Configurado — PRODUÇÃO | Webhook: ${EXTERNAL_SUPABASE_URL}/functions/v1/pix-webhook`
            : "⚠️ Configurado mas INATIVO"
          : "❌ API Key não configurada",
        settings,
      ),
    },
    {
      id: "resend",
      label: "Resend (Email)",
      description: "E-mails transacionais, cobranças e relatórios",
      icon: Mail,
      status: resendConfigured
        ? resend?.is_active
          ? resend?.sandbox_mode
            ? "warning"
            : "ok"
          : "warning"
        : "error",
      detail: resendConfigured
        ? resend?.is_active
          ? resend?.sandbox_mode
            ? "✅ Configurado — modo SANDBOX"
            : `✅ Ativo — remetente: ${resend?.from_email}`
          : "⚠️ Configurado mas INATIVO"
        : "❌ API Key não configurada",
      adminPath: "/admin/resend",
      docsUrl: "https://resend.com/api-keys",
      required: true,
      canTest: true,
      ...mergePersistedHealth(
        "resend",
        resendConfigured
          ? resend?.is_active
            ? resend?.sandbox_mode
              ? "warning"
              : "ok"
            : "warning"
          : "error",
        resendConfigured
          ? resend?.is_active
            ? resend?.sandbox_mode
              ? "✅ Configurado — modo SANDBOX"
              : `✅ Ativo — remetente: ${resend?.from_email}`
            : "⚠️ Configurado mas INATIVO"
          : "❌ API Key não configurada",
        settings,
      ),
    },
    {
      id: "whatsapp",
      label: `WhatsApp (${wa?.provider || "não definido"})`,
      description: "Boas-vindas, matches e alertas de Selo Oculto",
      icon: MessageCircle,
      status: waConfigured ? (wa?.is_active ? "ok" : "warning") : "warning",
      detail: waConfigured
        ? wa?.is_active
          ? "✅ Configurado e ativo"
          : "⚠️ Configurado mas inativo"
        : "⚠️ Opcional — não configurado (Twilio/Z-API/Evolution)",
      adminPath: "/admin/whatsapp",
      required: false,
      canTest: true,
      ...mergePersistedHealth(
        "whatsapp",
        waConfigured ? (wa?.is_active ? "ok" : "warning") : "warning",
        waConfigured
          ? wa?.is_active
            ? "✅ Configurado e ativo"
            : "⚠️ Configurado mas inativo"
          : "⚠️ Opcional — não configurado (Twilio/Z-API/Evolution)",
        settings,
      ),
    },
    {
      id: "vapid",
      label: "Notificações Push (VAPID)",
      description: "Push nativo no browser via Service Worker",
      icon: Bell,
      status:
        vapidEnabled && vapidPublic && vapidPrivate
          ? "ok"
          : vapidPublic && !vapidPrivate
            ? "error"
            : "warning",
      detail:
        vapidEnabled && vapidPublic && vapidPrivate
          ? "✅ Configurado — chaves VAPID geradas"
          : "⚠️ Clique em 'Gerar Chaves VAPID' no painel de Push",
      adminPath: "/admin/push-campaigns",
      required: true,
      ...mergePersistedHealth(
        "vapid",
        vapidEnabled && vapidPublic && vapidPrivate
          ? "ok"
          : vapidPublic && !vapidPrivate
            ? "error"
            : "warning",
        vapidEnabled && vapidPublic && vapidPrivate
          ? "✅ Configurado — chaves VAPID geradas"
          : "⚠️ Clique em 'Gerar Chaves VAPID' no painel de Push",
        settings,
      ),
    },
    {
      id: "cloudflare",
      label: "Cloudflare Stream",
      description: "Transcodificação e CDN de vídeos",
      icon: Video,
      status: "ok",
      detail:
        "✅ Secrets configurados (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_API_TOKEN)",
      required: false,
      ...mergePersistedHealth(
        "cloudflare",
        "ok",
        "✅ Secrets configurados (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_API_TOKEN)",
        settings,
      ),
    },
    {
      id: "discord",
      label: "Discord Webhook",
      description: "Alertas internos de vendas e eventos críticos",
      icon: MessageSquare,
      status: "ok",
      detail: "✅ DISCORD_WEBHOOK_URL configurado",
      required: false,
      ...mergePersistedHealth(
        "discord",
        "ok",
        "✅ DISCORD_WEBHOOK_URL configurado",
        settings,
      ),
    },
    {
      id: "asaas",
      label: "Asaas — PIX & Saques",
      description: "Gateway PIX, split automático e processamento de saques",
      icon: QrCode,
      status:
        pixConfigured && pix?.gateway_provider === "asaas" ? "ok" : "warning",
      detail:
        pixConfigured && pix?.gateway_provider === "asaas"
          ? `✅ ${pix?.sandbox_mode ? "Sandbox" : "Produção"} ativa`
          : "⚠️ Aguardando API Key de produção",
      docsUrl: "https://docs.asaas.com/reference/introducao",
      required: true,
      canTest: true,
      ...mergePersistedHealth(
        "asaas",
        pixConfigured && pix?.gateway_provider === "asaas" ? "ok" : "warning",
        pixConfigured && pix?.gateway_provider === "asaas"
          ? `✅ ${pix?.sandbox_mode ? "Sandbox" : "Produção"} ativa`
          : "⚠️ Aguardando API Key de produção",
        settings,
      ),
    },
  ];

  return baseItems;
}

// ─── Status styles ────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  ok: {
    badge: "bg-primary/10 text-primary border-primary/30",
    icon: "text-primary",
    bg: "bg-primary/10",
    dot: "bg-primary",
  },
  warning: { badge: "", icon: "", bg: "", dot: "" },
  error: {
    badge: "bg-destructive/10 text-destructive border-destructive/30",
    icon: "text-destructive",
    bg: "bg-destructive/10",
    dot: "bg-destructive",
  },
  loading: {
    badge: "bg-muted text-muted-foreground",
    icon: "text-muted-foreground",
    bg: "bg-muted",
    dot: "bg-muted-foreground",
  },
} as const;

const WARN_STYLES = {
  badge: {
    backgroundColor: "hsl(38 92% 50% / 0.1)",
    color: "hsl(38 92% 35%)",
    borderColor: "hsl(38 92% 50% / 0.3)",
  },
  icon: { color: "hsl(38 92% 35%)" },
  bg: { backgroundColor: "hsl(38 92% 50% / 0.1)" },
  dot: { backgroundColor: "hsl(38 92% 50%)" },
};

function StatusBadge({ status }: { status: IntegrationStatus["status"] }) {
  const labels = {
    ok: "Operacional",
    warning: "Atenção",
    error: "Pendente",
    loading: "Verificando...",
  };
  const isWarn = status === "warning";
  const s = STATUS_STYLES[status];
  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1 ${s.badge}`}
      style={isWarn ? WARN_STYLES.badge : undefined}
    >
      {status === "ok" && <CheckCircle2 className="h-3 w-3" />}
      {status === "warning" && <AlertTriangle className="h-3 w-3" />}
      {status === "error" && <XCircle className="h-3 w-3" />}
      {labels[status]}
    </Badge>
  );
}

// ─── Quick-test state per service ─────────────────────────────────────────────
type TestState = "idle" | "testing" | "ok" | "fail";

async function getSystemSettingValue(key: string) {
  const rows = await fetchSettingsRows({ keys: [key] });
  return normalizeSettingValue(rows[0]?.value);
}

async function getStoredOpenAIKey() {
  return getSystemSettingValue("openai_api_key_encrypted");
}

async function runOpenAIConnectionTest(apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const raw = await response.text();
  const payload = raw
    ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || payload?.message || `HTTP ${response.status}`,
    );
  }

  return "OpenAI API operacional ✅";
}

async function persistIntegrationHealth(
  serviceId: string,
  status: "OK" | "FAIL",
  message: string,
) {
  const now = new Date().toISOString();
  const historyEntry: IntegrationHistoryEntry = {
    serviceId,
    serviceLabel: SERVICE_LABELS[serviceId] || serviceId,
    status,
    message,
    testedAt: now,
  };
  const { data: existingHistory } = await (supabase as any)
    .from("system_settings")
    .select("value")
    .eq("key", "integrations_test_history")
    .maybeSingle();
  const previousHistory = (() => {
    try {
      const parsed = JSON.parse(
        normalizeSettingValue(existingHistory?.value) || "[]",
      );
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  await Promise.all([
    upsertSystemSetting(
      `${serviceId}_configured`,
      status === "OK" ? "true" : "false",
      `${SERVICE_LABELS[serviceId] || serviceId} validado via painel de integrações`,
    ),
    upsertSystemSetting(
      `${serviceId}_last_test_status`,
      status,
      `Último status do teste ${SERVICE_LABELS[serviceId] || serviceId}`,
    ),
    upsertSystemSetting(
      `${serviceId}_last_test_message`,
      message,
      `Última mensagem do teste ${SERVICE_LABELS[serviceId] || serviceId}`,
    ),
    upsertSystemSetting(
      `${serviceId}_last_test_at`,
      now,
      `Data/hora do último teste ${SERVICE_LABELS[serviceId] || serviceId}`,
    ),
    upsertSystemSetting(
      "integrations_test_history",
      JSON.stringify([historyEntry, ...previousHistory].slice(0, 50)),
      "Histórico dos testes executados no painel de integrações",
    ),
  ]);
}

async function persistIntegrationReference(serviceId: string, message: string) {
  await Promise.all([
    upsertSystemSetting(
      `${serviceId}_configured`,
      "true",
      `${SERVICE_LABELS[serviceId] || serviceId} referenciado via painel de integrações`,
    ),
    upsertSystemSetting(
      `${serviceId}_reference_status`,
      "referenced",
      `${SERVICE_LABELS[serviceId] || serviceId} salvo, ainda não validado`,
    ),
    upsertSystemSetting(
      `${serviceId}_last_test_message`,
      message,
      `Última mensagem ${SERVICE_LABELS[serviceId] || serviceId}`,
    ),
  ]);
}

const persistOpenAIHealth = (status: "OK" | "FAIL", message: string) =>
  persistIntegrationHealth("openai", status, message);

async function fetchIntegrationHistory(): Promise<IntegrationHistoryEntry[]> {
  const [data, historySetting] = await Promise.all([
    fetchSettingsRows({ like: "%_last_test_%" }),
    getSystemSettingValue("integrations_test_history"),
  ]);

  const persistedHistory = (() => {
    try {
      const parsed = JSON.parse(normalizeSettingValue(historySetting) || "[]");
      return Array.isArray(parsed) ? (parsed as IntegrationHistoryEntry[]) : [];
    } catch {
      return [];
    }
  })();

  const grouped: Record<string, Partial<IntegrationHistoryEntry>> = {};
  (data || []).forEach((s: any) => {
    const key = String(s.key || "");
    const serviceId = key.replace(/_last_test_(status|message|at)$/, "");
    if (!serviceId || serviceId === key) return;
    grouped[serviceId] = grouped[serviceId] || {
      serviceId,
      serviceLabel: SERVICE_LABELS[serviceId] || serviceId,
    };
    if (key.endsWith("_status"))
      grouped[serviceId].status = normalizeSettingValue(s.value) as
        | "OK"
        | "FAIL";
    if (key.endsWith("_message"))
      grouped[serviceId].message = normalizeSettingValue(s.value);
    if (key.endsWith("_at"))
      grouped[serviceId].testedAt = normalizeSettingValue(s.value);
  });

  const latestByService = Object.values(grouped)
    .filter(
      (entry): entry is IntegrationHistoryEntry =>
        !!entry.serviceId && !!entry.status && !!entry.testedAt,
    )
    .sort(
      (a, b) => new Date(b.testedAt).getTime() - new Date(a.testedAt).getTime(),
    );

  const uniqueHistory = [...persistedHistory, ...latestByService].filter(
    (entry) => entry.serviceId && entry.status && entry.testedAt,
  );

  return Array.from(
    new Map(
      uniqueHistory.map((entry) => [
        `${entry.serviceId}-${entry.testedAt}-${entry.status}-${entry.message}`,
        entry,
      ]),
    ).values(),
  )
    .sort(
      (a, b) => new Date(b.testedAt).getTime() - new Date(a.testedAt).getTime(),
    )
    .slice(0, 50);
}

function useConnectionTest(serviceId: string, onRefresh?: () => void) {
  const [state, setState] = useState<TestState>("idle");

  const run = async () => {
    setState("testing");
    try {
      let ok = false;
      let message = "Teste concluído";

      if (serviceId === "pix") {
        const { data } = await supabase.functions.invoke("pix-gateway", {
          body: { action: "test-connection" },
        });
        ok = data?.success === true;
        message =
          data?.message ||
          data?.error ||
          (ok ? "Gateway PIX operacional ✅" : "Falha ao validar Gateway PIX");
      } else if (serviceId === "resend") {
        const { data } = await supabase.functions.invoke(
          "test-resend-connection",
        );
        ok = data?.success === true;
        message =
          data?.message ||
          data?.error ||
          (ok ? "Resend operacional ✅" : "Falha ao validar Resend");
      } else if (serviceId === "whatsapp") {
        const { data } = await supabase.functions.invoke("whatsapp-gateway", {
          body: { action: "test-connection" },
        });
        ok = data?.success === true;
        message =
          data?.message ||
          data?.error ||
          (ok ? "WhatsApp operacional ✅" : "Falha ao validar WhatsApp");
      } else if (serviceId === "asaas") {
        const { data } = await supabase.functions.invoke("pix-gateway", {
          body: { action: "test-connection" },
        });
        ok = data?.success === true;
        message =
          data?.message ||
          data?.error ||
          (ok ? "Asaas operacional ✅" : "Falha ao validar Asaas");
      }

      setState(ok ? "ok" : "fail");
      await persistIntegrationHealth(serviceId, ok ? "OK" : "FAIL", message);
      onRefresh?.();
    } catch (e: any) {
      setState("fail");
      await persistIntegrationHealth(
        serviceId,
        "FAIL",
        e?.message || "Erro ao executar teste",
      ).catch(() => null);
      onRefresh?.();
    }
    setTimeout(() => setState("idle"), 4000);
  };

  return { state, run };
}

// ─── Integration card ─────────────────────────────────────────────────────────
function IntegrationCard({
  item,
  onRefresh,
}: {
  item: IntegrationStatus;
  onRefresh: () => void;
}) {
  const Icon = item.icon;
  const isWarn = item.status === "warning";
  const s = STATUS_STYLES[item.status];
  const { state: testState, run: runTest } = useConnectionTest(
    item.id,
    onRefresh,
  );

  return (
    <Card
      className={`border transition-colors ${item.status === "error" ? "border-destructive/40" : "border-border"}`}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg}`}
            style={isWarn ? WARN_STYLES.bg : undefined}
          >
            <Icon
              className={`h-5 w-5 ${s.icon}`}
              style={isWarn ? WARN_STYLES.icon : undefined}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{item.label}</span>
              {item.required && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1 py-0 h-4 border-muted-foreground/40"
                >
                  Obrigatório
                </Badge>
              )}
              <StatusBadge status={item.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.description}
            </p>
            <p className="text-xs mt-1 font-mono text-foreground/70">
              {item.detail}
            </p>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              <span>
                {item.referenceState === "validated"
                  ? "Validado"
                  : item.referenceState === "referenced"
                    ? "Referência salva, aguardando teste"
                    : "Sem validação persistida"}
              </span>
              {item.lastTestAt && (
                <span>
                  • {new Date(item.lastTestAt).toLocaleString("pt-BR")}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Test button */}
            {item.canTest && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={runTest}
                disabled={testState === "testing"}
              >
                {testState === "testing" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : testState === "ok" ? (
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                ) : testState === "fail" ? (
                  <XCircle className="h-3 w-3 text-destructive" />
                ) : (
                  <TestTube className="h-3 w-3" />
                )}
                {testState === "testing"
                  ? "Testando…"
                  : testState === "ok"
                    ? "OK"
                    : testState === "fail"
                      ? "Falhou"
                      : "Testar"}
              </Button>
            )}
            {item.adminPath && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                asChild
              >
                <a href={item.adminPath}>Configurar</a>
              </Button>
            )}
            {item.docsUrl && (
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label="Ação">
                <a
                  href={item.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── OpenAI Integration Card ───────────────────────────────────────────────────
function OpenAICard({ onRefresh }: { onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testDetail, setTestDetail] = useState<string | null>(null);
  const [lastTestResult, setLastTestResult] = useState<"ok" | "fail" | null>(
    null,
  );
  const [configActive, setConfigActive] = useState(false);

  // Check if OpenAI is configured on mount
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "openai_configured",
          "openai_reference_status",
          "openai_last_test_status",
          "openai_last_test_message",
        ]);
      const settings: Record<string, string> = {};
      (data || []).forEach((s: any) => {
        settings[s.key] = normalizeSettingValue(s.value);
      });
      if (settings.openai_last_test_status === "OK") {
        setConfigActive(true);
        setLastTestResult("ok");
        setTestDetail(
          settings.openai_last_test_message || "OpenAI API operacional ✅",
        );
        setApiKey(await getStoredOpenAIKey().catch(() => ""));
      } else if (settings.openai_last_test_status === "FAIL") {
        setConfigActive(false);
        setLastTestResult("fail");
        setTestDetail(
          settings.openai_last_test_message || "OpenAI falhou no último teste",
        );
        setApiKey(await getStoredOpenAIKey().catch(() => ""));
      } else if (
        isTruthySetting(settings.openai_configured) ||
        settings.openai_reference_status === "referenced"
      ) {
        setConfigActive(false);
        setLastTestResult(null);
        setTestDetail(
          settings.openai_last_test_message ||
            "OpenAI referenciada — aguardando validação manual",
        );
        setApiKey(await getStoredOpenAIKey().catch(() => ""));
      }
    })();
  }, []);

  const runTest = async () => {
    setTestState("testing");
    setTestDetail(null);
    try {
      const storedKey = (await getStoredOpenAIKey().catch(() => "")) || apiKey.trim();
      if (!storedKey) {
        throw new Error("Salve a OPENAI_API_KEY antes de testar.");
      }

      const message = await runOpenAIConnectionTest(storedKey);
      setTestState("ok");
      setLastTestResult("ok");
      setConfigActive(true);
      setTestDetail(message);
      await persistOpenAIHealth("OK", message);
      onRefresh();
    } catch (e: any) {
      setTestState("fail");
      setLastTestResult("fail");
      const message = e?.message || "Erro ao testar a conexão com a OpenAI";
      setConfigActive(false);
      setTestDetail(message);
      await persistOpenAIHealth("FAIL", message).catch(() => null);
      onRefresh();
    }
    setTimeout(() => setTestState("idle"), 6000);
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      return toast({ title: "Informe a API Key", variant: "destructive" });
    }
    setSaving(true);
    try {
      await upsertSystemSetting(
        "openai_api_key_encrypted",
        apiKey.trim(),
        "OPENAI_API_KEY configurada via painel de integrações",
      );
      await persistIntegrationReference(
        "openai",
        "OpenAI referenciada — aguardando validação manual",
      );
      toast({
        title: "Chave salva com sucesso",
        description:
          "O badge ficará como Atenção até você clicar em Testar e receber OK da API.",
      });
      setConfigActive(false);
      setLastTestResult(null);
      setTestDetail("OpenAI referenciada — aguardando validação manual");
      setOpen(false);
      onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Status persistido: usa o resultado do último teste concluído, não reseta para "warning"
  const status: IntegrationStatus["status"] =
    testState === "ok"
      ? "ok"
      : testState === "fail"
        ? "error"
        : lastTestResult === "ok"
          ? "ok"
          : lastTestResult === "fail"
            ? "error"
            : configActive
              ? "ok"
              : "warning";
  const isWarn = status === "warning";
  const s = STATUS_STYLES[status];

  return (
    <Card
      className={`border transition-colors ${status === "error" ? "border-destructive/40" : "border-border"}`}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg}`}
            style={isWarn ? WARN_STYLES.bg : undefined}
          >
            <BrainCircuit
              className={`h-5 w-5 ${s.icon}`}
              style={isWarn ? WARN_STYLES.icon : undefined}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">OpenAI</span>
              <StatusBadge status={status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              GPT-4o — IA para chat, análise e automações
            </p>
            <p className="text-xs mt-1 font-mono text-foreground/70">
              {testDetail ?? "Clique em 'Testar' para validar a OPENAI_API_KEY"}
            </p>

            {/* Inline editor */}
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1 mt-2"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                  Atualizar OPENAI_API_KEY
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3 border border-border rounded-lg p-4 bg-muted/20">
                <div className="space-y-1">
                  <Label className="text-xs">API Key (sk-…)</Label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      className="h-8 text-xs pr-8"
                      placeholder="sk-••••••••••••••••"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowKey((v) => !v)}
                    >
                      {showKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    A chave fica salva nas configurações administrativas deste
                    ambiente para reaproveitar o teste depois.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleSaveKey}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Salvar chave
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={runTest}
              disabled={testState === "testing"}
            >
              {testState === "testing" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : testState === "ok" ? (
                <CheckCircle2 className="h-3 w-3 text-primary" />
              ) : testState === "fail" ? (
                <XCircle className="h-3 w-3 text-destructive" />
              ) : (
                <TestTube className="h-3 w-3" />
              )}
              {testState === "testing"
                ? "Testando…"
                : testState === "ok"
                  ? "OK"
                  : testState === "fail"
                    ? "Falhou"
                    : "Testar"}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label="Ação">
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Asaas Card — status dinâmico + API Key de produção ───────────────────────
function AsaasCard({ onRefresh }: { onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testDetail, setTestDetail] = useState<string | null>(null);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configActive, setConfigActive] = useState(false);

  // Load config status on mount
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("pix_gateway_config")
        .select("is_active, api_key_encrypted, sandbox_mode")
        .eq("gateway_provider", "asaas")
        .maybeSingle();
      const { data: settingsRows } = await (supabase as any)
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "asaas_configured",
          "asaas_reference_status",
          "asaas_last_test_status",
          "asaas_last_test_message",
        ]);
      const settings: Record<string, string> = {};
      (settingsRows || []).forEach((s: any) => {
        settings[s.key] = normalizeSettingValue(s.value);
      });

      if (settings.asaas_last_test_status === "OK") {
        setConfigActive(true);
        setTestDetail(
          settings.asaas_last_test_message ||
            `Asaas API operacional ✅${data?.sandbox_mode ? " (SANDBOX)" : ""}`,
        );
        setSandboxMode(!!data?.sandbox_mode);
      } else if (settings.asaas_last_test_status === "FAIL") {
        setConfigActive(false);
        setTestDetail(
          settings.asaas_last_test_message || "Asaas falhou no último teste",
        );
        setSandboxMode(!!data?.sandbox_mode);
      } else if (data?.api_key_encrypted && data.api_key_encrypted.length > 5) {
        setConfigActive(false);
        setTestDetail(
          settings.asaas_last_test_message ||
            "Asaas referenciado — aguardando teste de conexão",
        );
        setSandboxMode(!!data.sandbox_mode);
      }
      setConfigLoaded(true);
    })();
  }, []);

  const WEBHOOK_URL =
    `${EXTERNAL_SUPABASE_URL}/functions/v1/asaas-webhook`;

  const runTest = async () => {
    setTestState("testing");
    setTestDetail(null);
    try {
      const { data, error } = await supabase.functions.invoke("pix-gateway", {
        body: { action: "test-connection" },
      });
      if (error) throw error;
      if (data?.success) {
        setTestState("ok");
        const message = data?.message || "Asaas API operacional ✅";
        setConfigActive(true);
        setTestDetail(message);
        await persistIntegrationHealth("asaas", "OK", message);
        onRefresh();
      } else {
        setTestState("fail");
        const message = data?.message || "Falha — verifique a API Key";
        setConfigActive(false);
        setTestDetail(message);
        await persistIntegrationHealth("asaas", "FAIL", message);
        onRefresh();
      }
    } catch (e: any) {
      setTestState("fail");
      const message = e?.message || "Erro ao contactar a edge function";
      setConfigActive(false);
      setTestDetail(message);
      await persistIntegrationHealth("asaas", "FAIL", message).catch(
        () => null,
      );
      onRefresh();
    }
    setTimeout(() => setTestState("idle"), 6000);
  };

  const handleSave = async () => {
    if (!apiKey.trim() && !webhookToken.trim()) {
      return toast({
        title: "Preencha pelo menos um campo",
        variant: "destructive",
      });
    }
    setSaving(true);
    try {
      const updates: any[] = [];
      if (apiKey.trim()) {
        updates.push(
          (supabase as any)
            .from("pix_gateway_config")
            .update({
              api_key_encrypted: apiKey.trim(),
              sandbox_mode: sandboxMode,
              gateway_provider: "asaas",
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq("gateway_provider", "asaas"),
        );
      }
      if (webhookToken.trim()) {
        updates.push(
          (supabase as any).from("system_settings").upsert(
            {
              key: "asaas_webhook_token_hint",
              value: "configurado",
              description: "Token webhook Asaas configurado via painel",
            },
            { onConflict: "key" },
          ),
        );
      }
      await Promise.all(updates);
      await persistIntegrationReference(
        "asaas",
        "Asaas referenciado — aguardando teste de conexão",
      );
      toast({
        title: "Referência salva — ainda não validada",
        description: sandboxMode
          ? "Asaas salvo em Sandbox. Clique em Testar para validar antes de considerar operacional."
          : "Asaas salvo em Produção. Clique em Testar para validar antes de considerar operacional.",
      });
      setConfigActive(false);
      setTestDetail("Asaas referenciado — aguardando teste de conexão");
      setApiKey("");
      setWebhookToken("");
      setOpen(false);
      onRefresh();
    } catch (e: any) {
      toast({
        title: "Erro ao salvar",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const status: IntegrationStatus["status"] =
    testState === "ok"
      ? "ok"
      : testState === "fail"
        ? "error"
        : configActive
          ? "ok"
          : "warning";
  const isWarn = status === "warning";
  const s = STATUS_STYLES[status];

  return (
    <Card
      className={`border transition-colors ${status === "error" ? "border-destructive/40" : "border-border"}`}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg}`}
            style={isWarn ? WARN_STYLES.bg : undefined}
          >
            <QrCode
              className={`h-5 w-5 ${s.icon}`}
              style={isWarn ? WARN_STYLES.icon : undefined}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">Asaas — PIX & Saques</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 h-4 border-muted-foreground/40"
              >
                Obrigatório
              </Badge>
              <StatusBadge status={status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gateway PIX, split automático e processamento de saques
            </p>
            <p className="text-xs mt-1 font-mono text-foreground/70 break-all">
              {testDetail ??
                "⚠️ Aguardando API Key de produção — clique em 'Configurar'"}
            </p>
            {/* Webhook URL display */}
            <div className="mt-2 flex items-center gap-2 bg-muted/40 rounded-md px-2 py-1.5">
              <Zap className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <p className="text-[10px] font-mono text-foreground/60 break-all">
                {WEBHOOK_URL}
              </p>
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(WEBHOOK_URL);
                  toast({
                    title: "URL copiada!",
                    description:
                      "Cole no painel Asaas › Segurança › URL do Webhook",
                  });
                }}
              >
                <Activity className="h-3 w-3" />
              </button>
            </div>

            {/* Inline editor */}
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1 mt-2"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                  Configurar API Key Asaas
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3 border border-border rounded-lg p-4 bg-muted/20">
                {/* Mode toggle */}
                <div className="flex items-center gap-3">
                  <Label className="text-xs">Modo:</Label>
                  <button
                    type="button"
                    onClick={() => setSandboxMode(false)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${!sandboxMode ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/40 text-muted-foreground"}`}
                  >
                    🚀 Produção
                  </button>
                  <button
                    type="button"
                    onClick={() => setSandboxMode(true)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${sandboxMode ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/40 text-muted-foreground"}`}
                  >
                    🧪 Sandbox
                  </button>
                </div>

                {/* API Key */}
                <div className="space-y-1">
                  <Label className="text-xs">
                    API Key do Asaas {sandboxMode ? "(Sandbox)" : "(Produção)"}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      className="h-8 text-xs pr-8"
                      placeholder="Cole sua API Key de produção Asaas"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowKey((v) => !v)}
                    >
                      {showKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Asaas › Minha conta › Integrações › Chave de API
                  </p>
                </div>

                {/* Webhook token */}
                <div className="space-y-1">
                  <Label className="text-xs">
                    Token de Autenticação do Webhook
                  </Label>
                  <Input
                    type="password"
                    className="h-8 text-xs"
                    placeholder="Ex: oculto_2026_prod"
                    value={webhookToken}
                    onChange={(e) => setWebhookToken(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Cole o mesmo token no painel Asaas › Segurança › Token de
                    autenticação
                  </p>
                </div>

                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Salvar Configuração
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={runTest}
              disabled={testState === "testing"}
            >
              {testState === "testing" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : testState === "ok" ? (
                <CheckCircle2 className="h-3 w-3 text-primary" />
              ) : testState === "fail" ? (
                <XCircle className="h-3 w-3 text-destructive" />
              ) : (
                <TestTube className="h-3 w-3" />
              )}
              {testState === "testing"
                ? "Testando…"
                : testState === "ok"
                  ? "OK"
                  : testState === "fail"
                    ? "Falhou"
                    : "Testar"}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label="Ação">
              <a
                href="https://docs.asaas.com/reference/introducao"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Inline key editor (WhatsApp quick-setup) ─────────────────────────────────
function WhatsAppQuickSetup({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("z-api");
  const [instanceId, setInstanceId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!apiKey)
      return toast({ title: "Preencha a API Key", variant: "destructive" });
    setSaving(true);
    try {
      const { data: existing } = await (supabase as any)
        .from("whatsapp_config")
        .select("id")
        .maybeSingle();
      const payload = {
        provider,
        instance_id: instanceId || null,
        api_key_encrypted: apiKey,
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) {
        await (supabase as any)
          .from("whatsapp_config")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await (supabase as any)
          .from("whatsapp_config")
          .insert({ ...payload, is_active: false, sandbox_mode: true });
      }
      await persistIntegrationReference(
        "whatsapp",
        "WhatsApp referenciado — aguardando validação manual",
      );
      toast({
        title: "Referência salva — ainda não validada",
        description:
          "Clique em Testar para validar e atualizar o badge para Operacional.",
      });
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast({
        title: "Erro ao salvar",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1 mt-2"
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
          Configurar credenciais WhatsApp aqui
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3 border border-border rounded-lg p-4 bg-muted/20">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Provedor</Label>
            <select
              className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="z-api">Z-API</option>
              <option value="twilio">Twilio</option>
              <option value="evolution-api">Evolution API</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Instance ID / Account SID</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Ex: 3C8A2B1D..."
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">API Key / Token</Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              className="h-8 text-xs pr-8"
              placeholder="••••••••••••••••"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          Salvar Credenciais
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Extended card with quick-setup for WhatsApp/OpenAI/Asaas ────────────────
function IntegrationCardExtended({
  item,
  onRefresh,
}: {
  item: IntegrationStatus;
  onRefresh: () => void;
}) {
  if (item.id === "openai") {
    return <OpenAICard onRefresh={onRefresh} />;
  }

  if (item.id === "asaas") {
    return <AsaasCard onRefresh={onRefresh} />;
  }

  if (item.id === "whatsapp" && item.status !== "ok") {
    const Icon = item.icon;
    const isWarn = item.status === "warning";
    const s = STATUS_STYLES[item.status];
    const { state: testState, run: runTest } = useConnectionTest(
      item.id,
      onRefresh,
    );

    return (
      <Card className="border border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div
              className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg}`}
              style={isWarn ? WARN_STYLES.bg : undefined}
            >
              <Icon
                className={`h-5 w-5 ${s.icon}`}
                style={isWarn ? WARN_STYLES.icon : undefined}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{item.label}</span>
                <StatusBadge status={item.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.description}
              </p>
              <p className="text-xs mt-1 font-mono text-foreground/70">
                {item.detail}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                <span>
                  {item.referenceState === "validated"
                    ? "Validado"
                    : item.referenceState === "referenced"
                      ? "Referência salva, aguardando teste"
                      : "Sem validação persistida"}
                </span>
                {item.lastTestAt && (
                  <span>
                    • {new Date(item.lastTestAt).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
              <WhatsAppQuickSetup onSaved={onRefresh} />
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {item.canTest && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={runTest}
                  disabled={testState === "testing"}
                >
                  {testState === "testing" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : testState === "ok" ? (
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                  ) : testState === "fail" ? (
                    <XCircle className="h-3 w-3 text-destructive" />
                  ) : (
                    <TestTube className="h-3 w-3" />
                  )}
                  {testState === "testing"
                    ? "Testando…"
                    : testState === "ok"
                      ? "OK"
                      : testState === "fail"
                        ? "Falhou"
                        : "Testar"}
                </Button>
              )}
              {item.adminPath && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  asChild
                >
                  <a href={item.adminPath}>Configurar</a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return <IntegrationCard item={item} onRefresh={onRefresh} />;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminIntegrationsStatusPage() {
  const { data: isMasterAdmin } = useIsMasterAdmin();
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    data: integrations,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["integrations-status", refreshKey],
    queryFn: fetchIntegrationStatuses,
    staleTime: 30_000,
  });

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["integrations-test-history", refreshKey],
    queryFn: fetchIntegrationHistory,
    staleTime: 30_000,
  });

  const handleRefresh = async () => {
    setRefreshKey((k) => k + 1);
    await Promise.all([refetch(), refetchHistory()]);
    toast({
      title: "Status atualizado",
      description: "Todas as integrações foram verificadas.",
    });
  };

  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const handleClearHistory = async () => {
    if (!window.confirm("Tem certeza que deseja limpar todo o histórico de testes?")) return;
    setIsClearingHistory(true);
    try {
      // Zera o histórico agregado
      await upsertSystemSetting(
        "integrations_test_history",
        "[]",
        "Histórico dos testes executados no painel de integrações",
      );

      // Tenta apagar entradas individuais *_last_test_* das duas tabelas
      const tables = ["system_settings", "oculto_admin_settings_fallback"];
      await Promise.all(
        tables.map(async (t) => {
          try {
            await (supabase as any).from(t).delete().like("key", "%_last_test_%");
          } catch {
            /* tabela pode não existir ou RLS pode bloquear, ignorado */
          }
        }),
      );

      setRefreshKey((k) => k + 1);
      await refetchHistory();
      toast({
        title: "Histórico limpo",
        description: "Todos os registros de testes foram removidos.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao limpar histórico",
        description: error?.message || "Falha desconhecida",
        variant: "destructive",
      });
    } finally {
      setIsClearingHistory(false);
    }
  };

  if (!isMasterAdmin) {
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

  const totalOk = integrations?.filter((i) => i.status === "ok").length ?? 0;
  const totalWarn =
    integrations?.filter((i) => i.status === "warning").length ?? 0;
  const totalError =
    integrations?.filter((i) => i.status === "error").length ?? 0;
  const criticalPending =
    integrations?.filter((i) => i.status === "error" && i.required) ?? [];

  const core = ["supabase", "openstreetmap"];
  const ai = ["openai"];
  const payments = ["pix", "asaas"];
  const comms = ["resend", "whatsapp", "vapid"];
  const infra = ["cloudflare", "discord"];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Status das Integrações
          </h1>
          <p className="text-muted-foreground mt-1">
            Mapeamento completo de APIs, chaves e serviços externos
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
          />
          Atualizar
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {isLoading ? "—" : totalOk}
            </div>
            <p className="text-sm text-muted-foreground">Operacionais</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div
              className="text-2xl font-bold"
              style={{ color: "hsl(38 92% 40%)" }}
            >
              {isLoading ? "—" : totalWarn}
            </div>
            <p className="text-sm text-muted-foreground">Atenção</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-destructive">
              {isLoading ? "—" : totalError}
            </div>
            <p className="text-sm text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical alert */}
      {criticalPending.length > 0 && !isLoading && (
        <Alert
          variant="destructive"
          className="bg-destructive/10 border-destructive/30"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Ação necessária:</strong>{" "}
            {criticalPending.map((i) => i.label).join(", ")} precisam ser
            configurados para que a plataforma funcione em produção.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary" />
              Histórico de testes das integrações
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearHistory}
              disabled={isClearingHistory || history.length === 0}
              className="h-8 gap-2 text-xs"
            >
              {isClearingHistory ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Limpar histórico
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum teste persistido ainda.
            </p>
          ) : (
            history.slice(0, 12).map((entry) => (
              <div
                key={`${entry.serviceId}-${entry.testedAt}`}
                className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {entry.serviceLabel}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        entry.status === "OK"
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-destructive/10 text-destructive border-destructive/30"
                      }
                    >
                      {entry.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground break-words mt-0.5">
                    {entry.message || "Sem mensagem retornada"}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(entry.testedAt).toLocaleString("pt-BR")}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Sections */}
      {[
        { title: "Infraestrutura Core", ids: core },
        { title: "Inteligência Artificial", ids: ai },
        { title: "Pagamentos", ids: payments },
        { title: "Comunicação", ids: comms },
        { title: "Infraestrutura Opcional", ids: infra },
      ].map(({ title, ids }) => (
        <div key={title} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </h2>
          {isLoading
            ? Array.from({ length: ids.length }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))
            : (() => {
                const STATUS_PRIORITY: Record<string, number> = {
                  error: 0,
                  warning: 1,
                  loading: 2,
                  ok: 3,
                };
                const orderedIds = [...ids].sort((a, b) => {
                  const itemA = integrations?.find((i) => i.id === a);
                  const itemB = integrations?.find((i) => i.id === b);
                  const pa = itemA ? (STATUS_PRIORITY[itemA.status] ?? 4) : 0;
                  const pb = itemB ? (STATUS_PRIORITY[itemB.status] ?? 4) : 0;
                  return pa - pb;
                });
                return orderedIds.map((id) => {
                  const item = integrations?.find((i) => i.id === id);
                  if (!item && id === "openai")
                    return <OpenAICard key="openai" onRefresh={handleRefresh} />;
                  if (!item) return null;
                  return (
                    <IntegrationCardExtended
                      key={item.id}
                      item={item}
                      onRefresh={handleRefresh}
                    />
                  );
                });
              })()}
        </div>
      ))}

      {/* Legend */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Legenda de Status</CardTitle>
        </CardHeader>
        <div className="px-6 pb-4 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            <span>
              <strong>Operacional</strong> — integração ativa e funcional em
              produção
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="h-3.5 w-3.5"
              style={{ color: "hsl(38 92% 40%)" }}
            />
            <span>
              <strong>Atenção</strong> — configurado mas em modo sandbox, ou
              inativo
            </span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            <span>
              <strong>Pendente</strong> — credenciais ausentes ou não
              configuradas
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
