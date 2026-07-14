/**
 * /admin/version-debug — Master Admin
 *
 * Painel de observabilidade do watcher /version.json:
 *  - contagem de chamadas, erros e erros consecutivos
 *  - última checagem e próxima permitida (throttle + backoff)
 *  - histórico das últimas 50 tentativas (com source, outcome, erro)
 *  - botão "Verificar agora" (ignora throttle), reset de stats
 *  - toggle de debug logging no console desta aba
 *
 * Acesso restrito a master admin via <MasterAdminRoute> em App.tsx.
 * Usuários comuns NUNCA chegam aqui.
 */
import { useEffect, useMemo, useState } from "react";
// SEO simples via document.title (projeto não usa react-helmet)
import { toast } from "sonner";
import {
  forceCheckUpdate,
  getCurrentAppVersion,
  getLastCheckAt,
  getNextAllowedCheckAt,
  getVersionDebugStats,
  resetVersionDebugStats,
  enableVersionDebugLogging,
  type VersionFetchAttempt,
} from "@/lib/appVersion";

function fmt(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR");
}
function fmtRelative(ts: number) {
  if (!ts) return "—";
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  const s = Math.round(abs / 1000);
  const label = m >= 1 ? `${m} min` : `${s}s`;
  return diff > 0 ? `em ${label}` : `há ${label}`;
}

const outcomeColors: Record<VersionFetchAttempt["outcome"], string> = {
  ok: "text-emerald-400",
  stale: "text-amber-400",
  error: "text-red-400",
};

export default function AdminVersionDebugPage() {
  const [tick, setTick] = useState(0);
  const [debugOn, setDebugOn] = useState(
    typeof window !== "undefined" && !!(window as any).__OCULTO_VERSION_DEBUG__,
  );
  const [checking, setChecking] = useState(false);

  // Auto-refresh do painel a cada 5s (sem rede — só lê localStorage).
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const stats = useMemo(() => getVersionDebugStats(), [tick]);
  const lastCheck = useMemo(() => getLastCheckAt(), [tick]);
  const nextAllowed = useMemo(() => getNextAllowedCheckAt(), [tick]);
  const current = useMemo(() => getCurrentAppVersion(), []);
  const inBackoff = stats.backoffUntil > Date.now();

  async function handleManualCheck() {
    setChecking(true);
    try {
      const res = await forceCheckUpdate();
      toast.success(
        `Checagem manual concluída · local ${res.current} · remoto ${res.remote ?? "—"}${res.upToDate ? " ✓" : " (desatualizado)"}`,
      );
      setTick((n) => n + 1);
    } catch (err) {
      toast.error(`Falha: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setChecking(false);
    }
  }

  function handleReset() {
    resetVersionDebugStats();
    toast.success("Estatísticas e throttle resetados.");
    setTick((n) => n + 1);
  }

  function handleToggleDebug() {
    const next = !debugOn;
    enableVersionDebugLogging(next);
    setDebugOn(next);
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      {(() => { if (typeof document !== "undefined") document.title = "Debug /version.json · Admin"; return null; })()}


      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Debug · /version.json</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Telemetria local do watcher de versão. Útil para validar que não há
          loops após deploy e que o throttle de 1h/aba está ativo.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card label="Versão atual (bundle)" value={current} />
        <Card label="Checagens totais (aba)" value={String(stats.totalCount)} />
        <Card
          label="Erros / consecutivos"
          value={`${stats.errorCount} / ${stats.consecutiveErrors}`}
          tone={stats.consecutiveErrors > 0 ? "warn" : "ok"}
        />
        <Card
          label="Backoff ativo"
          value={inBackoff ? `sim · até ${fmt(stats.backoffUntil)}` : "não"}
          tone={inBackoff ? "warn" : "ok"}
        />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <Card label="Última checagem" value={`${fmt(lastCheck)} (${fmtRelative(lastCheck)})`} />
        <Card
          label="Próxima permitida"
          value={`${fmt(nextAllowed)} (${fmtRelative(nextAllowed)})`}
          tone={nextAllowed > Date.now() ? "warn" : "ok"}
        />
      </section>

      <section className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={handleManualCheck}
          disabled={checking}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {checking ? "Verificando…" : "Verificar agora (ignora throttle)"}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted"
        >
          Resetar estatísticas
        </button>
        <button
          onClick={handleToggleDebug}
          className={`px-4 py-2 rounded-md border text-sm font-medium ${
            debugOn ? "border-emerald-500 text-emerald-400" : "border-border"
          }`}
        >
          Debug console: {debugOn ? "ON" : "OFF"}
        </button>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Últimas {stats.attempts.length} tentativas
        </h2>
        {stats.attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma tentativa registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Quando</th>
                  <th className="px-3 py-2 text-left">Origem</th>
                  <th className="px-3 py-2 text-left">Resultado</th>
                  <th className="px-3 py-2 text-left">Local</th>
                  <th className="px-3 py-2 text-left">Remoto</th>
                  <th className="px-3 py-2 text-left">Erro</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.attempts].reverse().map((a, i) => (
                  <tr key={`${a.t}-${i}`} className="border-t border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(a.t)}</td>
                    <td className="px-3 py-2">{a.source}</td>
                    <td className={`px-3 py-2 font-medium ${outcomeColors[a.outcome]}`}>
                      {a.outcome}
                    </td>
                    <td className="px-3 py-2 font-mono">{a.baseline}</td>
                    <td className="px-3 py-2 font-mono">{a.remote ?? "—"}</td>
                    <td className="px-3 py-2 text-red-400">{a.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-8 text-xs text-muted-foreground">
        Dados ficam apenas no <code>localStorage</code> desta aba/navegador.
        Throttle: 1h. Backoff inicial: 30s · cap 30 min · cresce 2× a cada erro consecutivo.
      </footer>
    </div>
  );
}

function Card({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-500/50"
      : tone === "ok"
        ? "border-emerald-500/30"
        : "border-border";
  return (
    <div className={`rounded-md border ${toneClass} bg-card p-3`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium break-words">{value}</div>
    </div>
  );
}
