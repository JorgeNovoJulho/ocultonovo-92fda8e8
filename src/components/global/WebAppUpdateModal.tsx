/**
 * WebAppUpdateModal — Modal global, responsivo e adaptativo (mobile/desktop)
 * que aparece para TODOS os usuários quando existe uma versão mais nova
 * publicada do WebApp. Permite atualizar com 1 toque (limpa cache + reload)
 * sem perder login/sessão/preferências.
 *
 * Regras:
 *  • Só aparece se houver atualização (useWebAppHasUpdate === true).
 *  • Se houver diferença real entre bundle local e /version.json, aparece no
 *    boot mobile/desktop. "Lembrar depois" só silencia na sessão atual.
 *  • Nunca incomoda quando a versão atual já é a mais recente.
 */
import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  checkWebAppVersion,
  forceWebAppUpdate,
  getInstalledAppVersion,
  type WebAppUpdateInfo,
} from "@/utils/appUpdateRecovery";

const SEEN_KEY = "oculto:webapp-update-modal:seen";
const PENDING_KEY = "oculto:webapp-update-modal:pending";

interface SeenEntry {
  remote: string;
  at: number; // epoch ms
}

interface PendingEntry {
  remote: string;
  at: number;
}

function writeSeen(remote: string) {
  try {
    localStorage.setItem(
      SEEN_KEY,
      JSON.stringify({ remote, at: Date.now() } satisfies SeenEntry),
    );
  } catch {
    /* noop */
  }
}

function readPending(): PendingEntry | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as PendingEntry;
    if (!obj?.remote || typeof obj.at !== "number") return null;
    return obj;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* noop */
  }
}

export const OPEN_WEBAPP_UPDATE_MODAL_EVENT = "oculto:open-webapp-update-modal";

function isSuppressedPublicShareRoute(): boolean {
  if (typeof window === "undefined") return false;
  return /^\/play\/(p|share)\//i.test(window.location.pathname) || /^\/c\//i.test(window.location.pathname);
}

/**
 * Em preview/dev/iframe NUNCA mostramos o modal de update. Em dev, cada
 * restart do Vite gera um novo __APP_VERSION__/version.json, o que faria o
 * modal abrir em loop. Em produção, a regra fica intacta.
 */
function isUpdateModalSuppressedEnv(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // Vite injeta import.meta.env.PROD = true apenas no build de produção
    if (!import.meta.env.PROD) return true;
  } catch { /* noop */ }
  try {
    if (window.self !== window.top) return true; // iframe (Lovable preview)
  } catch { return true; }
  const h = window.location.hostname || "";
  if (
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h.endsWith(".lovableproject.com") ||
    h === "lovableproject.com" ||
    h.endsWith(".lovableproject-dev.com") ||
    h === "lovableproject-dev.com"
  ) {
    return true;
  }
  return false;
}

const SEEN_SUPPRESS_MS = 12 * 60 * 60 * 1000; // 12h
function isRemoteAlreadySeen(remote: string | null | undefined): boolean {
  if (!remote) return false;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw) as SeenEntry;
    if (!obj || obj.remote !== remote) return false;
    return Date.now() - (obj.at || 0) < SEEN_SUPPRESS_MS;
  } catch {
    return false;
  }
}

export function WebAppUpdateModal() {
  const [info, setInfo] = useState<WebAppUpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [, setForced] = useState(false);

  const installed = getInstalledAppVersion();

  // Verifica versão em segundo plano, sem bloquear a UI.
  useEffect(() => {
    if (isSuppressedPublicShareRoute()) return;
    if (isUpdateModalSuppressedEnv()) return;

    let cancelled = false;
    const run = async (force = false, hintedRemote?: string) => {
      if (isSuppressedPublicShareRoute()) return;
      if (!force && isUpdateModalSuppressedEnv()) return;
      try {
        let result = await checkWebAppVersion();
        if (hintedRemote && (!result.remote || result.remote !== hintedRemote)) {
          result = { ...result, remote: hintedRemote, upToDate: hintedRemote === installed };
        }
        if (cancelled) return;
        setInfo(result);

        if (force) {
          setForced(true);
          setOpen(true);
          return;
        }

        if (!result || result.upToDate) {
          clearPending();
          return;
        }

        // Não reabre o modal para uma versão remota que o usuário já viu
        // (ou aceitou) recentemente — evita loop quando o /update.html
        // não consegue avançar a versão por cache de PWA/CDN.
        if (isRemoteAlreadySeen(result.remote)) {
          clearPending();
          return;
        }

        const pending = readPending();
        const hasPendingVersion = Boolean(pending?.remote && pending.remote === result.remote);

        // Se existe mismatch real, mostra o modal sem forçar reload em loop.
        // O redirect automático fica centralizado no watcher de appVersion,
        // com guarda persistente por versão.
        if (!hasPendingVersion && !result.remote) return;

        setForced(false);
        setOpen(true);
      } catch {
        /* ignore — nunca bloquear o app por causa do checker */
      }
    };

    // Pequeno delay para não competir com o boot inicial do app.
    const t = window.setTimeout(() => run(false), 900);

    // Reverifica quando a aba volta a ficar visível (cobre PWA aberta há horas).
    const onVis = () => {
      if (isSuppressedPublicShareRoute()) return;
      if (isUpdateModalSuppressedEnv()) return;
      if (document.visibilityState === "visible") run(false);
    };
    document.addEventListener("visibilitychange", onVis);

    // Permite abrir o modal manualmente (CTAs, slide do feed, etc.) —
    // botões manuais SEMPRE podem abrir, mesmo em preview.
    const onOpenRequest = (event: Event) => {
      if (isSuppressedPublicShareRoute()) return;
      const hintedRemote = (event as CustomEvent<{ remote?: string }>).detail?.remote;
      run(!hintedRemote, hintedRemote);
    };
    window.addEventListener(OPEN_WEBAPP_UPDATE_MODAL_EVENT, onOpenRequest as EventListener);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(OPEN_WEBAPP_UPDATE_MODAL_EVENT, onOpenRequest as EventListener);
    };
  }, []);

  if (isSuppressedPublicShareRoute()) return null;

  const handleClose = () => {
    if (updating) return;
    if (info?.remote) writeSeen(info.remote);
    clearPending();
    setOpen(false);
  };

  const handleUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    clearPending();
    // Marca a versão como "vista/aceita" ANTES de redirecionar. Se o
    // /update.html falhar em avançar a versão (cache de PWA/CDN/WebView),
    // o modal não reabre em loop ao voltar.
    if (info?.remote) writeSeen(info.remote);
    toast.message("Atualizando o Oculto…", {
      description: "Carregando a versão mais recente. Sua sessão é preservada.",
    });
    try {
      await forceWebAppUpdate("manual", info?.remote);
      // Em caso de sucesso, há redirect — não devemos voltar aqui.
    } catch {
      setUpdating(false);
      toast.error("Não foi possível atualizar automaticamente. Feche e abra o app novamente.");
    }
  };

  if (!open || !info) return null;
  const isUpToDate = info.upToDate;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="
          w-[calc(100vw-1.5rem)] max-w-md p-0 overflow-hidden
          border border-emerald-300/30
          bg-gradient-to-br from-emerald-950/95 via-teal-950/90 to-background
          shadow-2xl
        "
      >
        <div className="relative px-5 pt-5 pb-3 border-b border-emerald-300/15">
          <button
            type="button"
            onClick={handleClose}
            disabled={updating}
            aria-label="Fechar"
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-emerald-100/70 hover:text-white hover:bg-emerald-400/10 transition-colors disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-3">
            <div className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 ring-1 ring-emerald-300/30">
              <Sparkles className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="flex items-center gap-2 text-base sm:text-lg text-white">
                  Atualização do WebApp
                  <Badge className="bg-emerald-400 text-emerald-950 hover:bg-emerald-400 border-emerald-200 text-[10px] uppercase tracking-wide">
                    {isUpToDate ? "Atualizado" : "Nova"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-[13px] sm:text-sm text-emerald-50/85 leading-relaxed">
                  {isUpToDate
                    ? "Você já está na versão mais recente. Caso queira forçar a atualização (limpar cache e recarregar), use o botão abaixo. Seu login e suas conversas são preservados."
                    : "Existe uma versão mais recente disponível. Atualize agora para receber correções visuais, melhorias de desempenho e novos recursos. Seu login e suas conversas são preservados."}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge variant="outline" className="font-mono border-emerald-300/30 text-emerald-100/90">
              instalada: {installed}
            </Badge>
            <Badge variant="outline" className="font-mono border-emerald-300/30 text-emerald-100/90">
              disponível: {info.remote ?? "—"}
            </Badge>
          </div>
          <p className="text-[12px] text-emerald-100/70 leading-relaxed">
            🔒 Atualizar não apaga sua conta, suas conversas ou seu login. Apenas
            limpa o cache de arquivos antigos e recarrega a versão mais nova.
          </p>
        </div>

        <DialogFooter className="px-5 pb-5 pt-1 gap-2 flex-col-reverse sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={updating}
            className="w-full sm:w-auto text-emerald-100/80 hover:text-white hover:bg-emerald-400/10"
          >
            Lembrar depois
          </Button>
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={updating}
            className="w-full sm:w-auto gap-2 bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-semibold ring-1 ring-emerald-200"
          >
            {updating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Atualizando…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" /> {isUpToDate ? "Forçar atualização" : "Atualizar agora"}
              </>
            )}
          </Button>
        </DialogFooter>

        <div className="px-5 pb-4 -mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => {
              // Re-checar manualmente sem atualizar
              checkWebAppVersion().then((r) => setInfo(r)).catch(() => {});
            }}
            className="inline-flex items-center gap-1.5 text-[11px] text-emerald-200/70 hover:text-emerald-100 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Verificar versão novamente
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default WebAppUpdateModal;
