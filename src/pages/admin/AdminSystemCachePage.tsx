import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getCurrentAppVersion,
  forceCheckUpdate,
  forceHardRefresh,
  clearAppCachesAndUnregisterSW,
} from "@/lib/appVersion";
import { RefreshCw, Trash2, Zap, ShieldCheck, AlertTriangle, Send, Copy, ExternalLink } from "lucide-react";

type Status = {
  current: string;
  remote: string | null;
  upToDate: boolean;
  builtAt?: string;
};

export default function AdminSystemCachePage() {
  const [status, setStatus] = useState<Status>({
    current: getCurrentAppVersion(),
    remote: null,
    upToDate: true,
  });
  const [loading, setLoading] = useState(false);
  const [swStatus, setSwStatus] = useState<string>("desconhecido");
  const [cacheCount, setCacheCount] = useState<number>(0);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await forceCheckUpdate();
      let builtAt: string | undefined;
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        const j = await r.json();
        builtAt = j?.builtAt;
      } catch {/* noop */}
      setStatus({ ...res, builtAt });

      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (!regs.length) setSwStatus("nenhum SW registrado");
        else {
          const r = regs[0];
          if (r.installing) setSwStatus("instalando");
          else if (r.waiting) setSwStatus("aguardando ativação");
          else if (r.active) setSwStatus("ativo");
          else setSwStatus("desconhecido");
        }
      } else setSwStatus("não suportado");

      if ("caches" in window) {
        const keys = await caches.keys();
        setCacheCount(keys.length);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Versionamento &amp; Cache</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Controle a versão do WebApp servida aos usuários, force atualizações e
          limpe caches antigos sem afetar login ou preferências.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Status atual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Versão local (este navegador)</div>
              <div className="font-mono font-semibold">{status.current}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Versão publicada</div>
              <div className="font-mono font-semibold">{status.remote ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Build em</div>
              <div className="font-mono">{status.builtAt ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Service Worker</div>
              <div className="font-mono">{swStatus}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Caches ativos</div>
              <div className="font-mono">{cacheCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Sincronia</div>
              {status.remote == null ? (
                <Badge variant="secondary">Sem rede</Badge>
              ) : status.upToDate ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Atualizado</Badge>
              ) : (
                <Badge variant="destructive" className="flex gap-1 items-center w-fit">
                  <AlertTriangle className="w-3 h-3" /> Desatualizado
                </Badge>
              )}
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Verificar agora
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                toast("Forçando atualização…");
                await forceHardRefresh();
              }}
            >
              <Zap className="w-4 h-4 mr-2" /> Forçar update neste navegador
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await clearAppCachesAndUnregisterSW();
                toast.success("Cache do app e Service Worker limpos.");
                setTimeout(() => window.location.reload(), 600);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Limpar caches + SW
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Estas ações limpam <strong>apenas</strong> os assets em cache do
            Oculto (chunks JS/CSS antigos) e o Service Worker. Login, sessão,
            tokens e preferências (localStorage) são preservados.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" /> Recovery para usuários presos em versão antiga
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Se algum usuário ficou preso em uma versão antiga do app (cache do
            navegador / PWA), envie o link abaixo. Ele abre uma página HTML
            estática que limpa cache + service worker e recarrega o app, sem
            apagar login nem dados.
          </p>

          {(() => {
            const updateUrl = `${typeof window !== "undefined" ? window.location.origin : "https://ocultoswing.com.br"}/update`;
            const message =
              `Atualização importante do Oculto. Toque aqui para atualizar ` +
              `automaticamente: ${updateUrl}\n\nIsso não apaga sua conta nem seus dados.`;
            return (
              <>
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm font-mono break-all">
                  {updateUrl}
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm whitespace-pre-wrap">
                  {message}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(message);
                        toast.success("Mensagem copiada — cole no chat do usuário.");
                      } catch {
                        toast.error("Não foi possível copiar. Selecione manualmente.");
                      }
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" /> Copiar mensagem pronta
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(updateUrl);
                        toast.success("Link copiado.");
                      } catch {
                        toast.error("Não foi possível copiar o link.");
                      }
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" /> Copiar só o link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open("/update", "_blank", "noopener")}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" /> Testar /update agora
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Dica: para os usuários atuais, mande esta mensagem manualmente
                  pelo chat ou WhatsApp. O envio em massa (notificação interna /
                  push) pode ser ligado depois — o link já é o caminho oficial
                  de recovery e funciona em mobile, desktop e PWA instalado.
                </p>
              </>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• A cada build/deploy o Vite gera um <code>version.json</code> com a versão atual.</p>
          <p>• Cada navegador que abre <strong>ocultoswing.com.br</strong> consulta esse arquivo (no-cache) ao iniciar, ao voltar para a aba e a cada 5 minutos.</p>
          <p>• Quando a versão difere, mostramos um toast discreto, limpamos o Cache Storage antigo, atualizamos o Service Worker e recarregamos uma vez.</p>
          <p>• Erros de <code>ChunkLoadError</code> / módulo dinâmico ausente redirecionam automaticamente para <code>/update</code> (HTML estático, não depende de chunks antigos) — evita tela branca após deploy.</p>
          <p>• A rota <code>/update</code> serve <code>public/update.html</code> com script inline mínimo: limpa <code>caches.keys()</code>, faz <code>unregister()</code> do Service Worker, preserva sessão Supabase e recarrega em <code>/</code>.</p>
          <p>• Existe guard por <code>sessionStorage</code> para impedir loop de reload (no máximo 1 reload por 30s) + failsafe de 10s na própria página.</p>
        </CardContent>
      </Card>
    </div>
  );
}
