import React, { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home, LifeBuoy } from 'lucide-react';
import { resolveSafeRecoveryPath } from '@/lib/lastProtectedPath';
import { PostLoginLoadingScreen } from '@/components/PostLoginLoadingScreen';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** If true, shows a minimal inline error instead of full-page */
  inline?: boolean;
  /** Called when error occurs — useful for custom logging */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorCount: number;
  retryCount: number;
  componentStack?: string;
  showDetails?: boolean;
  copied?: boolean;
}

/** Texto técnico do erro para o usuário copiar e enviar ao suporte/dev. */
function buildErrorReport(error?: Error, componentStack?: string): string {
  const lines: string[] = [];
  try {
    lines.push(`Erro: ${error?.name || 'Error'}: ${error?.message || String(error)}`);
    lines.push(`Página: ${typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''}`);
    lines.push(`Quando: ${new Date().toISOString()}`);
    lines.push(`Navegador: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`);
    try {
      const v = (window as any).__APP_VERSION__ || document.querySelector('meta[name="app-version"]')?.getAttribute('content');
      if (v) lines.push(`Versão: ${v}`);
    } catch { /* noop */ }
    const stack = String(error?.stack || '').split('\n').slice(0, 8).join('\n');
    if (stack) lines.push('', 'Stack:', stack);
    const comp = String(componentStack || '').trim().split('\n').slice(0, 8).join('\n');
    if (comp) lines.push('', 'Componentes:', comp);
  } catch { /* noop */ }
  return lines.join('\n');
}

const LOOP_KEY = '__oculto_err_loop';
const LOOP_WINDOW_MS = 60_000;
const LOOP_THRESHOLD = 3;
const CHUNK_RECOVER_KEY = '__oculto_chunk_recover';

/**
 * Detecta erros típicos de chunks Vite/React.lazy que falharam ao baixar
 * (deploy novo, cache do Service Worker stale, conexão mobile flaky).
 * Esses erros são MUITO comuns logo após login em redes 4G/5G instáveis e
 * são a causa principal do loop "Algo deu errado → volta pra landing".
 */
function isChunkLoadError(error: any): boolean {
  if (!error) return false;
  const name = String(error?.name || '');
  const msg = String(error?.message || error || '');
  if (name === 'ChunkLoadError') return true;
  return (
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

/**
 * Auto-recuperação para falhas de chunk: limpa SW + caches e recarrega a
 * MESMA rota uma única vez (com cache bust). Evita o loop em que o usuário
 * é devolvido à landing perdendo o contexto de navegação após login.
 */
function recoverFromChunkError(): boolean {
  try {
    const recoveredRaw = sessionStorage.getItem(CHUNK_RECOVER_KEY);
    const recovered = recoveredRaw ? Number(recoveredRaw) : 0;
    // Janela curta — se já tentamos no último minuto, não fica reciclando
    if (recovered && Date.now() - recovered < 60_000) return false;
    sessionStorage.setItem(CHUNK_RECOVER_KEY, String(Date.now()));
  } catch { /* ignore */ }

  const finish = () => {
    try {
      // Se o pathname atual for público (landing/login) por causa de uma
      // navegação intermediária que falhou, restaura o ÚLTIMO caminho
      // protegido — evita o "loop pra landing" após login em mobile.
      const safePath = resolveSafeRecoveryPath();
      const sep = safePath.includes('?') ? '&' : '?';
      const target = `${safePath}${sep}_cr=${Date.now()}`;
      window.location.replace(target);
    } catch {
      window.location.reload();
    }
  };

  try {
    if (typeof caches !== 'undefined') {
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => { /* ignore */ })
        .finally(() => {
          if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations?.()
              .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))))
              .catch(() => { /* ignore */ })
              .finally(finish);
          } else {
            finish();
          }
        });
      return true;
    }
  } catch { /* ignore */ }
  finish();
  return true;
}

/**
 * Limpa caches do navegador e storages voláteis SEM derrubar a sessão de auth.
 * Usado como "rota de fuga" quando o usuário fica preso em loop de erro.
 */
function hardResetAndReload(target: string = '/') {
  try {
    // Preserva tokens de auth do Supabase para não forçar relogin
    const preserved: Record<string, string> = {};
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          preserved[k] = localStorage.getItem(k) || '';
        }
      });
    } catch { /* ignore */ }

    try { sessionStorage.clear(); } catch { /* ignore */ }
    try {
      // Remove só caches voláteis (zustand persist de UI, react-query etc.)
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) return; // mantém auth
        if (
          k.includes('cache') ||
          k.includes('query') ||
          k.includes('feed') ||
          k.includes('persist') ||
          k.startsWith('rq-') ||
          k.startsWith('tanstack')
        ) {
          localStorage.removeItem(k);
        }
      });
    } catch { /* ignore */ }

    // Restaura tokens preservados
    try {
      Object.entries(preserved).forEach(([k, v]) => localStorage.setItem(k, v));
    } catch { /* ignore */ }

    // CacheStorage (PWA / service worker)
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => { /* ignore */ });
    }
    // Service worker — força atualização
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        regs.forEach((r) => r.update().catch(() => { /* ignore */ }));
      }).catch(() => { /* ignore */ });
    }
  } finally {
    try { sessionStorage.removeItem(LOOP_KEY); } catch { /* ignore */ }
    // Reload completo (bust cache do HTML)
    const url = target + (target.includes('?') ? '&' : '?') + '_r=' + Date.now();
    try {
      window.location.replace(url);
    } catch {
      window.location.href = url;
    }
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorCount: 0, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState(prev => ({ errorCount: prev.errorCount + 1, componentStack: errorInfo?.componentStack || undefined }));
    // Sempre registra no console (também em produção) para diagnóstico.
    try { console.error('[ErrorBoundary]', error, errorInfo?.componentStack?.slice(0, 600)); } catch { /* noop */ }
    this.props.onError?.(error, errorInfo);

    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error.message, errorInfo.componentStack?.slice(0, 400));
    }

    // 1) Falha de chunk (lazy import) — recupera transparentemente
    // recarregando a MESMA rota com cache busting. É a causa principal
    // do loop "login → tela preta → volta pra landing" em mobile.
    if (isChunkLoadError(error)) {
      const recovered = recoverFromChunkError();
      if (recovered) return; // página vai recarregar — não precisa rastrear loop
    }

    // 2) Detecção de loop entre montagens (recarregamentos consecutivos)
    try {
      const now = Date.now();
      const raw = sessionStorage.getItem(LOOP_KEY);
      const data = raw ? JSON.parse(raw) as { count: number; first: number } : { count: 0, first: now };
      const fresh = now - data.first > LOOP_WINDOW_MS ? { count: 1, first: now } : { count: data.count + 1, first: data.first };
      sessionStorage.setItem(LOOP_KEY, JSON.stringify(fresh));

      // Se já temos vários erros recentes, força reset automático após 1.5s
      // — preservando a rota atual (não derruba pra landing).
      if (fresh.count >= LOOP_THRESHOLD) {
        const safePath = resolveSafeRecoveryPath();
        setTimeout(() => hardResetAndReload(safePath), 1500);
      }
    } catch { /* ignore */ }
  }

  handleRetry = () => {
    // Se já tentou várias vezes na mesma sessão de tela, escalar para reload
    if (this.state.retryCount >= 1) {
      window.location.reload();
      return;
    }
    this.setState(prev => ({ hasError: false, error: undefined, retryCount: prev.retryCount + 1 }));
  };

  handleHardReset = () => {
    // Preserva contexto: se estamos numa rota pública por causa de uma
    // navegação intermediária que falhou, restaura o último caminho
    // protegido conhecido em vez de derrubar o usuário pra Landing.
    hardResetAndReload(resolveSafeRecoveryPath());
  };

  handleHome = () => {
    // Sempre reload completo para garantir saída do loop
    window.location.replace('/feed?_r=' + Date.now());
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    if (this.props.inline) {
      return (
        <div className="flex flex-wrap items-center justify-center gap-2 p-4 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span>Erro ao carregar este bloco.</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={this.handleRetry}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Tentar
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={this.handleHardReset}>
            <LifeBuoy className="h-3 w-3 mr-1" />
            Limpar & reiniciar
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center p-6 text-center min-h-[60vh] gap-4">
        <div className="p-3 rounded-2xl bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground mb-1">Algo deu errado</h3>
          <p className="text-sm text-muted-foreground max-w-[300px]">
            Ocorreu um erro inesperado. Se o problema persistir, toque em <strong>Limpar & reiniciar</strong> para sair do loop.
          </p>
          {this.state.error && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <button
                type="button"
                className="text-[11px] underline text-muted-foreground hover:text-foreground"
                onClick={() => this.setState((p) => ({ showDetails: !p.showDetails }))}
              >
                {this.state.showDetails ? 'Ocultar detalhes do erro' : 'Ver detalhes do erro'}
              </button>
              {this.state.showDetails && (
                <>
                  <pre className="text-left text-[10px] leading-snug font-mono text-destructive/80 bg-muted/40 rounded-md p-2 max-w-[340px] max-h-48 overflow-auto whitespace-pre-wrap break-all">
                    {buildErrorReport(this.state.error, this.state.componentStack)}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const text = buildErrorReport(this.state.error, this.state.componentStack);
                      try {
                        void navigator.clipboard?.writeText(text).then(
                          () => this.setState({ copied: true }),
                          () => this.setState({ copied: false }),
                        );
                      } catch { /* noop */ }
                    }}
                  >
                    {this.state.copied ? 'Copiado!' : 'Copiar detalhes'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Tentar novamente
          </Button>
          <Button variant="ghost" size="sm" onClick={this.handleHome}>
            <Home className="h-4 w-4 mr-1.5" />
            Início
          </Button>
          <Button variant="destructive" size="sm" onClick={this.handleHardReset}>
            <LifeBuoy className="h-4 w-4 mr-1.5" />
            Limpar & reiniciar
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/70 max-w-[280px]">
          Se nada funcionar, o app vai se reiniciar automaticamente em alguns segundos.
        </p>
      </div>
    );
  }
}

/**
 * Lightweight wrapper: Suspense + ErrorBoundary per route.
 * Replaces the repetitive <Suspense fallback={<PageFallback />}><Component /></Suspense> pattern.
 */
const RouteSpinner = () => (
  <div
    className="min-h-[30vh] flex items-center justify-center"
    aria-hidden="true"
  >
    <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

interface SafeSuspenseProps {
  children: ReactNode;
  /** Custom fallback spinner / skeleton */
  fallback?: ReactNode;
  /** If true, uses inline error display (no full-page error) */
  inline?: boolean;
}

export function SafeSuspense({ children, fallback, inline }: SafeSuspenseProps) {
  return (
    <ErrorBoundary inline={inline}>
      <React.Suspense fallback={fallback ?? <RouteSpinner />}>
        {children}
      </React.Suspense>
    </ErrorBoundary>
  );
}
