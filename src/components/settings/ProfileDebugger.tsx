import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchProfileRecord, repairProfile } from "@/lib/profileRepair";
import { useShowDebugPanels } from "@/hooks/useShowDebugPanels";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Database,
  Wrench,
  XCircle,
  HelpCircle,
} from "lucide-react";

type TabId = "account" | "address" | "tags";

interface FieldCheck {
  label: string;
  key: string;
  ok: boolean;
  value: string;
  /** Aba das Configurações onde o usuário preenche este campo */
  tab?: TabId;
  /** Se true, o campo é preenchido pelo próprio usuário (não por reparo automático) */
  userFillable?: boolean;
}

type Snapshot = { fields: FieldCheck[]; timestamp: number };
type Status =
  | { kind: "idle" }
  | { kind: "loading"; msg: string }
  | { kind: "success"; msg: string; hint?: string }
  | { kind: "warning"; msg: string; hint?: string }
  | { kind: "error"; msg: string; hint?: string };

const buildChecks = (d: any): FieldCheck[] => {
  const bannerUrl = d.cover_image_url || d.banner_url || null;
  return [
    { label: "Username", key: "username", ok: !!d.username, value: d.username || "—", tab: "account", userFillable: true },
    { label: "Avatar", key: "avatar_url", ok: !!d.avatar_url, value: d.avatar_url ? "✓ URL" : "—", tab: "account", userFillable: true },
    { label: "Banner", key: "cover_image_url", ok: !!bannerUrl, value: bannerUrl ? "✓ URL" : "—", tab: "account", userFillable: true },
    { label: "Birth Date", key: "birth_date", ok: !!d.birth_date, value: d.birth_date || "—", tab: "account", userFillable: true },
    { label: "Gender", key: "gender", ok: !!d.gender, value: d.gender || "—", tab: "account", userFillable: true },
    {
      label: "Tags Social",
      key: "tags_social",
      ok: Array.isArray(d.tags_social || d.tags) && (d.tags_social || d.tags).length > 0,
      value: Array.isArray(d.tags_social || d.tags) ? `${(d.tags_social || d.tags).length} tags` : "—",
      tab: "tags",
      userFillable: true,
    },
    {
      label: "Tags Adult",
      key: "tags_adult",
      ok: Array.isArray(d.tags_adult) && d.tags_adult.length > 0,
      value: Array.isArray(d.tags_adult) ? `${d.tags_adult.length} tags` : "—",
      tab: "tags",
      userFillable: true,
    },
    { label: "CEP", key: "address_cep", ok: !!d.address_cep, value: d.address_cep || "—", tab: "address", userFillable: true },
    { label: "City", key: "address_city", ok: !!d.address_city, value: d.address_city || "—", tab: "address", userFillable: true },
    {
      label: "GPS Lat",
      key: "location_lat",
      ok: d.location_lat != null && d.location_lat !== 0,
      value: d.location_lat != null ? String(d.location_lat) : "—",
      tab: "address",
      userFillable: true,
    },
    {
      label: "GPS Lng",
      key: "location_lng",
      ok: d.location_lng != null && d.location_lng !== 0,
      value: d.location_lng != null ? String(d.location_lng) : "—",
      tab: "address",
      userFillable: true,
    },
    { label: "Plan", key: "plan_type", ok: !!d.plan_type, value: d.plan_type || "free" },
  ];
};

const TAB_LABEL: Record<TabId, string> = {
  account: "Conta",
  address: "Endereço",
  tags: "Afinidades",
};

const StatusBanner = ({ status }: { status: Status }) => {
  if (status.kind === "idle") return null;
  const styles =
    status.kind === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : status.kind === "error"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : status.kind === "warning"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
          : "border-border bg-muted/40 text-muted-foreground";
  const Icon =
    status.kind === "success"
      ? CheckCircle2
      : status.kind === "error"
        ? XCircle
        : status.kind === "warning"
          ? AlertTriangle
          : Loader2;
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${styles}`}>
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${status.kind === "loading" ? "animate-spin" : ""}`} />
      <div className="space-y-0.5">
        <p className="font-medium">{status.msg}</p>
        {"hint" in status && status.hint && <p className="opacity-80">{status.hint}</p>}
      </div>
    </div>
  );
};

export function ProfileDebugger({ onNavigateTab }: { onNavigateTab?: (tab: string) => void } = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  // Gate de segurança interno: este painel é EXCLUSIVO do Admin Master
  const showDebug = useShowDebugPanels();
  if (!showDebug) return null;
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [fields, setFields] = useState<FieldCheck[] | null>(null);
  const [previous, setPrevious] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<"check" | "repair" | "recheck" | null>(null);

  const fetchProfile = useCallback(async (): Promise<{ data: any; matchedBy: "user_id" | "id" | null; error: any }> => {
    if (!user?.id) return { data: null, matchedBy: null, error: new Error("no_user") };
    return fetchProfileRecord(user.id);
  }, [user?.id]);

  const runCheck = useCallback(async () => {
    if (!user?.id || busy) return;
    setBusy("check");
    setStatus({ kind: "loading", msg: "Etapa 1/2: lendo profiles por user_id…" });

    const { data, matchedBy, error } = await fetchProfile();

    if (error) {
      setBusy(null);
      setStatus({
        kind: "error",
        msg: "Falha de query no banco",
        hint: error?.message || "Verifique RLS e conexão com o Supabase.",
      });
      return;
    }
    if (!data) {
      setBusy(null);
      setFields(null);
      setStatus({
        kind: "error",
        msg: "Perfil não encontrado para este user_id",
        hint: "Sugestão: clique em Re-sync para tentar reparar via storage, ou refaça o cadastro.",
      });
      return;
    }

    setStatus({ kind: "loading", msg: `Etapa 2/2: validando campos (match por ${matchedBy})…` });
    const checks = buildChecks(data);
    setFields(checks);
    setBusy(null);

    const missing = checks.filter((c) => !c.ok);
    if (missing.length === 0) {
      setStatus({ kind: "success", msg: `Tudo sincronizado (match por ${matchedBy}).` });
    } else {
      const userPending = missing.filter((m) => m.userFillable);
      const tabsToVisit = [...new Set(userPending.map((m) => m.tab).filter(Boolean))]
        .map((t) => TAB_LABEL[t as TabId])
        .join(", ");
      setStatus({
        kind: "warning",
        msg: `${missing.length} campo(s) ausente(s): ${missing.map((m) => m.label).join(", ")}`,
        hint: userPending.length === missing.length
          ? `Esses dados são preenchidos por você. Abra a aba ${tabsToVisit} ou use o botão "Preencher" abaixo.`
          : `Use Re-sync para tentar restaurar Avatar/Banner pelo storage; o resto preencha em ${tabsToVisit}.`,
      });
    }
  }, [user?.id, busy, fetchProfile]);

  const handleResyncAndCompare = useCallback(async () => {
    if (!user?.id || busy) return;

    setBusy("repair");
    setStatus({ kind: "loading", msg: "Capturando snapshot antes do reparo…" });
    try {
      const result = await repairProfile(user.id);
      if (result.before) {
        setPrevious({ fields: buildChecks(result.before), timestamp: Date.now() });
      }

      if (!result.profileFound || !result.after) {
        setFields(null);
        setBusy(null);
        setStatus({
          kind: "error",
          msg: "Perfil não pôde ser recriado automaticamente",
          hint: "Faça login novamente e salve o perfil para gerar a linha base no banco.",
        });
        return;
      }

      const newChecks = buildChecks(result.after);
      setFields(newChecks);

      const recovered = previous?.fields
        ? previous.fields.filter((p) => !p.ok && newChecks.find((n) => n.key === p.key && n.ok)).map((p) => p.label)
        : result.repairedFields;
      const hint = result.messages.map((message) => message.text).join(" • ");

      setBusy(null);
      if (recovered.length > 0) {
        setStatus({
          kind: "success",
          msg: `Reparo aplicado. Recuperado: ${[...new Set(recovered)].join(", ")}`,
          hint,
        });
        return;
      }

      // Após reparo, qualquer campo ainda faltante é responsabilidade do usuário (não há como reparar via storage/RPC)
      const stillMissing = newChecks.filter((c) => !c.ok && c.userFillable);
      if (stillMissing.length > 0) {
        const tabsToVisit = [...new Set(stillMissing.map((m) => m.tab).filter(Boolean))]
          .map((t) => TAB_LABEL[t as TabId])
          .join(", ");
        setStatus({
          kind: "warning",
          msg: `Reparo automático concluído. ${stillMissing.length} campo(s) precisam ser preenchidos por você: ${stillMissing.map((m) => m.label).join(", ")}`,
          hint: `Esses dados não estão no banco nem no storage — abra a aba ${tabsToVisit} e clique em "Preencher" abaixo de cada campo para ir direto.`,
        });
        return;
      }

      setStatus({
        kind: "success",
        msg: result.updated
          ? "Reparo concluído. Todos os campos monitorados estão sincronizados."
          : "Tudo já estava sincronizado — nenhuma mudança necessária.",
        hint,
      });
    } catch (err: any) {
      setBusy(null);
      setStatus({
        kind: "error",
        msg: "Falha ao reparar perfil",
        hint: err?.message || "Erro desconhecido no reparo",
      });
      toast({ title: "Erro no reparo", description: err?.message || "Erro desconhecido no reparo", variant: "destructive" });
    }
  }, [user?.id, busy, fetchProfile, previous?.fields, toast]);

  const recheckOnly = useCallback(async () => {
    if (!user?.id || busy) return;
    setBusy("recheck");
    if (fields) setPrevious({ fields, timestamp: Date.now() });
    await runCheck();
    setBusy(null);
  }, [user?.id, busy, fields, runCheck]);

  const allOk = fields && fields.every((f) => f.ok);
  const hasMissing = fields && fields.some((f) => !f.ok);

  // diff helper
  const diffFor = (key: string) => {
    if (!previous) return null;
    const prev = previous.fields.find((f) => f.key === key);
    const curr = fields?.find((f) => f.key === key);
    if (!prev || !curr) return null;
    if (prev.ok === curr.ok) return null;
    return curr.ok ? "fixed" : "regressed";
  };

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
          <Database className="h-4 w-4" />
          Profile Debugger
          <Badge variant="outline" className="text-[10px] ml-auto">
            DEV
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Step-by-step guide */}
        <ol className="text-[11px] text-muted-foreground space-y-1 pl-1">
          <li className="flex gap-1.5">
            <HelpCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span><b>1.</b> Check Sync lê <code>profiles</code> por <code>user_id</code> (fallback <code>id</code>).</span>
          </li>
          <li className="flex gap-1.5">
            <HelpCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span><b>2.</b> Re-sync tenta o RPC e, se ele não existir, reconstrói avatar/banner direto do storage.</span>
          </li>
          <li className="flex gap-1.5">
            <HelpCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span><b>3.</b> Reexecutar valida se a correção persistiu.</span>
          </li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={runCheck} disabled={!!busy || !user?.id} className="flex-1 min-w-[140px]">
            {busy === "check" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            Check Sync
          </Button>
          {fields && (
            <Button variant="outline" size="sm" onClick={recheckOnly} disabled={!!busy} className="text-foreground">
              {busy === "recheck" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Reexecutar
            </Button>
          )}
          {(hasMissing || !fields) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResyncAndCompare}
              disabled={!!busy}
              className="text-primary border-primary/30"
            >
              {busy === "repair" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Wrench className="h-4 w-4 mr-1.5" />}
              Re-sync
            </Button>
          )}
        </div>

        <StatusBanner status={status} />

        {fields && (
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {fields.map((f) => {
              const diff = diffFor(f.key);
              // Cor: verde quando OK, laranja quando o usuário precisa preencher, vermelho quando é falha técnica
              const tone = f.ok
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                : f.userFillable
                  ? "border-amber-500/30 bg-amber-500/5 text-amber-400"
                  : "border-destructive/20 bg-destructive/5 text-destructive";
              const Icon = f.ok ? CheckCircle2 : AlertTriangle;
              return (
                <div key={f.key} className={`flex items-center gap-1.5 px-2 py-1 rounded border ${tone}`}>
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="font-medium truncate">{f.label}</span>
                  {diff === "fixed" && (
                    <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400 px-1 py-0">
                      ↑ corrigido
                    </Badge>
                  )}
                  {diff === "regressed" && (
                    <Badge variant="outline" className="text-[9px] border-destructive/40 text-destructive px-1 py-0">
                      ↓ regrediu
                    </Badge>
                  )}
                  <span className="ml-auto text-[10px] opacity-70 truncate max-w-[60px]">{f.value}</span>
                  {!f.ok && f.tab && onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab(f.tab!)}
                      className="text-[9px] underline opacity-90 hover:opacity-100 shrink-0"
                      title={`Ir para a aba ${TAB_LABEL[f.tab]}`}
                    >
                      Preencher
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {previous && fields && (
          <p className="text-[10px] text-muted-foreground text-center">
            Comparando com snapshot de {new Date(previous.timestamp).toLocaleTimeString()}
          </p>
        )}

        {allOk && <p className="text-[11px] text-emerald-400 text-center font-medium">✅ Oculto Master — Fully Synced</p>}
      </CardContent>
    </Card>
  );
}
