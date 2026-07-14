import { useEffect, useState } from "react";

import { Loader2, Smartphone, RefreshCw, Bell, Download, WifiOff, Shield, Save, KeyRound, CheckCircle2, AlertTriangle, Copy, Activity, Stethoscope, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseExternal";
import { clearPWASettingsCache, usePWASettings } from "@/hooks/usePWASettings";
import { forceCheckUpdate, getCurrentAppVersion, getUpdateRedirectLog } from "@/lib/appVersion";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

function base64UrlToBytes(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(`${normalized}${padding}`);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateBrowserVapidKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  if (!publicKeyJwk.x || !publicKeyJwk.y || !privateKeyJwk.d) {
    throw new Error("Falha ao exportar as chaves VAPID geradas");
  }

  const xBytes = base64UrlToBytes(publicKeyJwk.x);
  const yBytes = base64UrlToBytes(publicKeyJwk.y);
  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 0x04;
  uncompressed.set(xBytes, 1);
  uncompressed.set(yBytes, 33);

  return {
    publicKey: bytesToBase64Url(uncompressed),
    privateKey: JSON.stringify(privateKeyJwk),
  };
}

export default function AdminPWAPage() {
  const { toast } = useToast();
  const { settings, refresh } = usePWASettings();
  const [local, setLocal] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [pushCount, setPushCount] = useState<number | null>(null);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [vapidEnabled, setVapidEnabled] = useState<boolean>(false);
  const [vapidLoading, setVapidLoading] = useState(false);
  const [vapidGenerating, setVapidGenerating] = useState(false);
  const [vapidPrivateConfigured, setVapidPrivateConfigured] = useState<boolean>(false);
  const [endpointTest, setEndpointTest] = useState<{ status: number | null; ok: boolean; message: string; ranAt: string } | null>(null);
  const [endpointTesting, setEndpointTesting] = useState(false);
  const [pushTest, setPushTest] = useState<{ ok: boolean; message: string; endpoint?: string; ranAt: string } | null>(null);
  const [pushTesting, setPushTesting] = useState(false);
  const [lastError, setLastError] = useState<{ stage: string; status?: number | string; code?: string; message: string; hint: string } | null>(null);
  const installedVersion = getCurrentAppVersion();
  const logs = getUpdateRedirectLog();

  const loadVapid = async () => {
    setVapidLoading(true);
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["vapid_public_key", "vapid_enabled", "vapid_private_key"]);
      const map: Record<string, string> = {};
      (data || []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
      setVapidPublicKey(map["vapid_public_key"] || null);
      setVapidEnabled(map["vapid_enabled"] === "true");
      setVapidPrivateConfigured(!!map["vapid_private_key"]);
    } catch { /* noop */ } finally { setVapidLoading(false); }
  };

  const testSetupVapidEndpoint = async () => {
    setEndpointTesting(true);
    const ranAt = new Date().toISOString();
    try {
      const url = `${EXTERNAL_SUPABASE_URL}/functions/v1/setup-vapid`;
      const res = await fetch(url, { method: "OPTIONS" });
      let message = "";
      if (res.status === 404) message = "404 — Function not found (não deployada). OK: o fluxo atual gera VAPID 100% no navegador, esse endpoint não é mais usado.";
      else if (res.status >= 200 && res.status < 400) message = `Endpoint respondendo (status ${res.status}). Disponível, mas não é usado pelo fluxo atual.`;
      else message = `Status inesperado: ${res.status}`;
      setEndpointTest({ status: res.status, ok: res.status !== 404, message, ranAt });
    } catch (e) {
      setEndpointTest({
        status: null,
        ok: false,
        message: `Erro de rede: ${e instanceof Error ? e.message : "unknown"}. Pode ser CORS ou função inexistente.`,
        ranAt,
      });
    } finally { setEndpointTesting(false); }
  };

  const testPushSubscription = async () => {
    setPushTesting(true);
    const ranAt = new Date().toISOString();
    try {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushTest({ ok: false, message: "Navegador não suporta Web Push.", ranAt });
        return;
      }
      if (!vapidPublicKey) {
        setPushTest({ ok: false, message: "Gere as chaves VAPID antes de testar.", ranAt });
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushTest({ ok: false, message: `Permissão de notificação: ${perm}.`, ranAt });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const keyBytes = base64UrlToBytes(vapidPublicKey);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes.buffer as ArrayBuffer,
        });
      }
      const json = sub.toJSON() as { endpoint?: string };
      setPushTest({
        ok: true,
        message: "Subscription criada com sucesso no navegador (mock, sem envio backend).",
        endpoint: json.endpoint,
        ranAt,
      });
    } catch (e) {
      setPushTest({
        ok: false,
        message: `Falhou: ${e instanceof Error ? e.message : "unknown"}`,
        ranAt,
      });
    } finally { setPushTesting(false); }
  };

  useEffect(() => { void loadVapid(); }, []);

  useEffect(() => { setLocal(settings); }, [settings]);
  useEffect(() => { document.title = "Admin · PWA / App — OCULTO"; }, []);

  useEffect(() => {
    (async () => {
      try {
        const { count } = await supabase
          .from("push_subscriptions")
          .select("id", { count: "exact", head: true });
        setPushCount(count ?? 0);
      } catch { setPushCount(null); }
    })();
  }, []);

  const checkVersion = async () => {
    setChecking(true);
    try {
      const res = await forceCheckUpdate();
      setRemoteVersion(res.remote);
      toast({ title: res.upToDate ? "Em dia" : "Atualização disponível", description: `Local ${res.current} • Remoto ${res.remote ?? "—"}` });
    } finally { setChecking(false); }
  };

  const generateVapid = async () => {
    setVapidGenerating(true);
    setLastError(null);
    try {
      const existingConfigured = vapidEnabled && vapidPublicKey;
      if (!existingConfigured) {
        const generated = await generateBrowserVapidKeys();
        const upserts = [
          { key: "vapid_public_key", value: generated.publicKey, category: "push", description: "VAPID Public Key (auto-generated via admin panel)" },
          { key: "vapid_private_key", value: generated.privateKey, category: "push", description: "VAPID Private Key JWK (auto-generated via admin panel)" },
          { key: "vapid_enabled", value: "true", category: "push", description: "Push notifications enabled" },
        ];

        const { error, status } = await supabase.from("system_settings").upsert(upserts, { onConflict: "key" });
        if (error) {
          const msg = error.message || "";
          let hint = "Erro desconhecido. Veja o console do navegador.";
          if (msg.includes("row-level security") || msg.includes("permission denied") || (error as { code?: string }).code === "42501") {
            hint = "Falta permissão RLS. Sua conta precisa ter role admin_master ou admin_regional em user_roles para gravar em system_settings.";
          } else if (msg.includes("category") || (error as { code?: string }).code === "42703") {
            hint = "Coluna 'category' ausente em system_settings. Rode a migração SQL pendente no SQL Editor.";
          } else if (msg.includes("duplicate")) {
            hint = "Conflito de unique. Apague linhas vapid_* em system_settings e tente novamente.";
          } else if (msg.includes("Failed to fetch") || msg.includes("network")) {
            hint = "Erro de rede com o Supabase externo. Verifique conexão.";
          }
          setLastError({
            stage: "supabase.upsert(system_settings)",
            status: status ?? undefined,
            code: (error as { code?: string }).code,
            message: msg,
            hint,
          });
          throw error;
        }
      }

      await loadVapid();
      toast({
        title: existingConfigured ? "VAPID já configurado" : "Chaves VAPID geradas ✓",
        description: "Push notifications prontas. Lembre de ligar o switch 'Notificações push' abaixo e salvar.",
      });
    } catch (e) {
      toast({
        title: "Erro ao gerar VAPID",
        description: e instanceof Error ? e.message : "Veja o painel de diagnóstico abaixo.",
        variant: "destructive",
      });
    } finally { setVapidGenerating(false); }
  };

  const copyVapid = async () => {
    if (!vapidPublicKey) return;
    try { await navigator.clipboard.writeText(vapidPublicKey); toast({ title: "Chave pública copiada" }); } catch { /* noop */ }
  };

  const save = async () => {
    if (!local) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("platform_runtime_settings")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (!existing?.id) throw new Error("Singleton não encontrado");
      const { error } = await supabase
        .from("platform_runtime_settings")
        .update({
          pwa_install_banner_enabled: local.pwa_install_banner_enabled,
          pwa_install_page_enabled: local.pwa_install_page_enabled,
          pwa_min_version: local.pwa_min_version || null,
          pwa_update_message: local.pwa_update_message,
          pwa_force_update: local.pwa_force_update,
          pwa_offline_fallback_enabled: local.pwa_offline_fallback_enabled,
          pwa_push_enabled: local.pwa_push_enabled,
        })
        .eq("id", existing.id);
      if (error) throw error;
      clearPWASettingsCache();
      await refresh();
      toast({ title: "Configurações salvas" });
    } catch (e) {
      toast({ title: "Erro ao salvar", description: e instanceof Error ? e.message : "Tente novamente", variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (!local) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const Toggle = ({ id, label, desc, value, onChange, icon: Icon }: { id: string; label: string; desc: string; value: boolean; onChange: (v: boolean) => void; icon: React.ComponentType<{ className?: string }> }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/40 last:border-0">
      <div className="flex gap-3 flex-1 min-w-0">
        <Icon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      <Switch id={id} checked={value} onCheckedChange={onChange} />
    </div>
  );

  return (
    <div className="container max-w-4xl py-6 space-y-6">

      <header className="flex items-center gap-3">
        <Smartphone className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">PWA / App</h1>
          <p className="text-sm text-muted-foreground">Controle de instalação, atualização e notificações push.</p>
        </div>
      </header>

      {/* CARD VAPID — sempre no topo para configuração inicial */}
      <Card className={vapidEnabled && vapidPublicKey ? "border-emerald-500/40" : "border-amber-500/60 bg-amber-500/5"}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Chaves VAPID (Web Push)
            {vapidLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : vapidEnabled && vapidPublicKey ? (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Configurado
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/60 text-amber-400 gap-1">
                <AlertTriangle className="h-3 w-3" /> Não configurado
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!vapidEnabled || !vapidPublicKey ? (
            <>
              <p className="text-sm text-muted-foreground">
                As notificações push <strong>não funcionarão</strong> até que as chaves VAPID sejam geradas.
                Clique no botão abaixo para gerar e armazenar automaticamente. Depois, ligue o switch
                "Notificações push" e salve.
              </p>
              <Button onClick={generateVapid} disabled={vapidGenerating} className="gap-2">
                {vapidGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Gerar chaves VAPID agora
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Chave pública atual (usada pelo navegador para subscribe):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-background/60 border border-border/40 rounded px-2 py-1.5 truncate">
                  {vapidPublicKey}
                </code>
                <Button size="sm" variant="outline" onClick={copyVapid} className="gap-1">
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Para regenerar, primeiro apague <code className="text-amber-400">vapid_public_key</code>,
                <code className="text-amber-400"> vapid_private_key</code> e <code className="text-amber-400">vapid_enabled</code> da tabela
                <code className="text-amber-400"> system_settings</code> e clique novamente em "Gerar".
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* DIAGNÓSTICO — status, testes e erros detalhados */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" /> Diagnóstico VAPID & Push
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status atual */}
          <div className="grid sm:grid-cols-3 gap-2 text-xs">
            <div className="p-3 rounded-lg border border-border/40 bg-card/30">
              <p className="text-muted-foreground">vapid_enabled</p>
              <p className={`font-mono font-bold ${vapidEnabled ? "text-emerald-400" : "text-amber-400"}`}>
                {vapidLoading ? "..." : String(vapidEnabled)}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-border/40 bg-card/30">
              <p className="text-muted-foreground">vapid_public_key</p>
              <p className={`font-mono font-bold ${vapidPublicKey ? "text-emerald-400" : "text-amber-400"}`}>
                {vapidLoading ? "..." : vapidPublicKey ? `${vapidPublicKey.slice(0, 12)}…` : "ausente"}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-border/40 bg-card/30">
              <p className="text-muted-foreground">vapid_private_key</p>
              <p className={`font-mono font-bold ${vapidPrivateConfigured ? "text-emerald-400" : "text-amber-400"}`}>
                {vapidLoading ? "..." : vapidPrivateConfigured ? "configurada" : "ausente"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={loadVapid} disabled={vapidLoading} className="gap-2">
              {vapidLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Recarregar status
            </Button>
            <Button size="sm" variant="outline" onClick={testSetupVapidEndpoint} disabled={endpointTesting} className="gap-2">
              {endpointTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
              Testar endpoint setup-vapid
            </Button>
            <Button size="sm" variant="outline" onClick={testPushSubscription} disabled={pushTesting} className="gap-2">
              {pushTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
              Testar push no navegador (mock)
            </Button>
          </div>

          {/* Resultado teste endpoint */}
          {endpointTest && (
            <div className={`p-3 rounded-lg border text-xs space-y-1 ${endpointTest.status === 404 ? "border-amber-500/40 bg-amber-500/5" : endpointTest.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}>
              <p className="font-bold flex items-center gap-2">
                {endpointTest.status === 404 ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> : endpointTest.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                Endpoint setup-vapid — HTTP {endpointTest.status ?? "erro"}
              </p>
              <p className="text-muted-foreground">{endpointTest.message}</p>
              <p className="text-[10px] text-muted-foreground/70 font-mono">URL: {`${EXTERNAL_SUPABASE_URL}/functions/v1/setup-vapid`}</p>
              <p className="text-[10px] text-muted-foreground/70">Executado em: {new Date(endpointTest.ranAt).toLocaleString("pt-BR")}</p>
            </div>
          )}

          {/* Resultado teste push */}
          {pushTest && (
            <div className={`p-3 rounded-lg border text-xs space-y-1 ${pushTest.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}>
              <p className="font-bold flex items-center gap-2">
                {pushTest.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                Subscription Web Push (mock — sem envio backend)
              </p>
              <p className="text-muted-foreground">{pushTest.message}</p>
              {pushTest.endpoint && (
                <p className="text-[10px] text-muted-foreground/70 font-mono break-all">endpoint: {pushTest.endpoint.slice(0, 80)}…</p>
              )}
              <p className="text-[10px] text-muted-foreground/70">Executado em: {new Date(pushTest.ranAt).toLocaleString("pt-BR")}</p>
            </div>
          )}

          {/* Último erro detalhado */}
          {lastError && (
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-xs space-y-1">
              <p className="font-bold flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Último erro ao gerar VAPID
              </p>
              <p><span className="text-muted-foreground">Etapa:</span> <span className="font-mono">{lastError.stage}</span></p>
              {lastError.status !== undefined && <p><span className="text-muted-foreground">Status:</span> <span className="font-mono">{String(lastError.status)}</span></p>}
              {lastError.code && <p><span className="text-muted-foreground">Código PG:</span> <span className="font-mono">{lastError.code}</span></p>}
              <p><span className="text-muted-foreground">Mensagem:</span> <span className="font-mono">{lastError.message}</span></p>
              <p className="text-amber-400 mt-1"><strong>Causa provável:</strong> {lastError.hint}</p>
            </div>
          )}
        </CardContent>
      </Card>




      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><RefreshCw className="h-4 w-4 text-primary" /> Versão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-mono">instalada: {installedVersion}</Badge>
            <Badge variant="outline" className="font-mono">remota: {remoteVersion ?? "—"}</Badge>
            <Button size="sm" variant="outline" onClick={checkVersion} disabled={checking} className="gap-2">
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Verificar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações</CardTitle>
        </CardHeader>
        <CardContent>
          <Toggle id="banner" icon={Download} label="Banner de instalação" desc="Mostra o card 'Instale o OCULTO' em Configurações, Perfil e Feed." value={local.pwa_install_banner_enabled} onChange={(v) => setLocal({ ...local, pwa_install_banner_enabled: v })} />
          <Toggle id="page" icon={Smartphone} label="Página /instalar" desc="Habilita rota pública com instruções por plataforma." value={local.pwa_install_page_enabled} onChange={(v) => setLocal({ ...local, pwa_install_page_enabled: v })} />
          <Toggle id="offline" icon={WifiOff} label="Fallback offline" desc="Mostra tela /offline.html e banner quando o usuário perde conexão." value={local.pwa_offline_fallback_enabled} onChange={(v) => setLocal({ ...local, pwa_offline_fallback_enabled: v })} />
          <Toggle id="push" icon={Bell} label="Notificações push" desc="Permite que usuários ativem push (mensagens, matches)." value={local.pwa_push_enabled} onChange={(v) => setLocal({ ...local, pwa_push_enabled: v })} />
          <Toggle id="force" icon={Shield} label="Forçar atualização" desc="Quando ligado, todos os clients recarregam na próxima visita." value={local.pwa_force_update} onChange={(v) => setLocal({ ...local, pwa_force_update: v })} />

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div>
              <Label htmlFor="min-ver" className="text-xs">Versão mínima obrigatória</Label>
              <Input
                id="min-ver"
                value={local.pwa_min_version ?? ""}
                onChange={(e) => setLocal({ ...local, pwa_min_version: e.target.value })}
                placeholder="ex: b1779718618543"
                className="font-mono text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="msg" className="text-xs">Mensagem de atualização</Label>
              <Textarea
                id="msg"
                rows={2}
                value={local.pwa_update_message}
                onChange={(e) => setLocal({ ...local, pwa_update_message: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Métricas</CardTitle></CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-lg border border-border/40 bg-card/30">
              <p className="text-xs text-muted-foreground">Push subscriptions ativas</p>
              <p className="text-2xl font-bold text-primary">{pushCount ?? "—"}</p>
            </div>
            <div className="p-4 rounded-lg border border-border/40 bg-card/30">
              <p className="text-xs text-muted-foreground">Redirects /update (local desta sessão)</p>
              <p className="text-2xl font-bold text-primary">{logs.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Últimos redirects /update (local)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs font-mono max-h-64 overflow-y-auto">
              {logs.slice(-20).reverse().map((l, i) => (
                <div key={i} className="flex gap-2 py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground">{new Date(l.t).toLocaleString("pt-BR")}</span>
                  <span className="text-amber-400">{l.reason}</span>
                  {l.skipped && <span className="text-emerald-400">skipped:{l.skipped}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
