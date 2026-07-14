import { useEffect, useState, createContext, useContext, ReactNode, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import {
  claimActiveSession,
  clearLocalSessionId,
  fetchCurrentSessionId,
  getOrCreateLocalSessionId,
  isMasterEmail,
} from '@/lib/singleSession';
import { authDiagnostics } from '@/lib/authDiagnostics';
import { getAuthRedirectUrl } from '@/lib/appConfig';
import { markCurrentUserOffline } from './usePresence';
import { clearLoginCache } from '@/lib/loginCache';

/**
 * Limpa TODO o cache de queries (React Query) + caches locais sensíveis
 * ao trocar de usuário/logout. Garante que dados de admin nunca vazem
 * para o próximo usuário logado no mesmo navegador.
 */
const purgeUserScopedCaches = (userId?: string | null) => {
  try {
    const qc = (window as any).__lovableReactQueryClient;
    if (qc?.clear) qc.clear();
    else if (qc?.removeQueries) qc.removeQueries();
  } catch { /* ignore */ }
  try { clearLoginCache(userId || undefined); } catch { /* ignore */ }
  try {
    // Caches específicos do app que carregam dados por usuário
    ['oculto:feedCache:v1', 'oculto:profileCache:v1', 'oculto:authorScopeCache:v1']
      .forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
  } catch { /* ignore */ }
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authReady: boolean;
  signUp: (email: string, password: string, name: string, username?: string, profileData?: Record<string, any>) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; session: Session | null; user: User | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const authClient = supabase;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(Object.assign(new Error('Servidor de autenticação indisponível no momento.'), {
          code: 'auth_timeout',
          status: 504,
        }));
      }, timeoutMs);
    }),
  ]);
};

const clearPossiblyCorruptedSession = async () => {
  try {
    await authClient.auth.signOut({ scope: 'local' });
  } catch {
    // ignore
  }

  try {
    [localStorage, sessionStorage].forEach((storage) => {
      Object.keys(storage).forEach((key) => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          storage.removeItem(key);
        }
      });
    });
  } catch {
    // ignore storage access errors
  }
};

const normalizeAuthError = (error: Error | null) => {
  if (!error) return null;

  return /Unexpected token '<'|<!doctype/i.test(error.message)
    ? Object.assign(new Error('O endpoint de autenticação retornou HTML em vez de JSON. Verifique proxy/rede do ambiente atual.'), {
        code: 'auth_html_response',
        status: (error as any)?.status ?? 0,
      })
    : error;
};

const isTransientAuthFailure = (error: Error | null) => {
  if (!error) return false;

  const message = String(error.message || '');
  const status = String((error as any)?.status ?? '');
  const code = String((error as any)?.code ?? '');

  return (
    code === 'auth_timeout' ||
    status === '502' ||
    status === '503' ||
    status === '504' ||
    /timeout/i.test(message) ||
    /upstream request timeout/i.test(message) ||
    /network request failed/i.test(message) ||
    /failed to fetch/i.test(message)
  );
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const guardRef = useRef<{ unsub: (() => void) | null; pollId: number | null; userId: string | null }>({
    unsub: null,
    pollId: null,
    userId: null,
  });

  const syncAuthState = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
  }, []);

  const forceLogoutAsTakenOver = async () => {
    try {
      clearLocalSessionId();
      // Logout LOCAL apenas. O logout padrão é global e pode revogar o refresh
      // token da aba/dispositivo que acabou de assumir a sessão, causando o
      // "feed pisca e desloga" ao abrir outra aba/modal.
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      try {
        const next = '/login?reason=session_taken_over';
        if (window.location.pathname + window.location.search !== next) {
          window.location.replace(next);
        }
      } catch { /* ignore */ }
    }
  };

  const stopSessionGuard = () => {
    const g = guardRef.current;
    if (g.unsub) {
      try { g.unsub(); } catch { /* ignore */ }
      g.unsub = null;
    }
    if (g.pollId !== null) {
      window.clearInterval(g.pollId);
      g.pollId = null;
    }
    g.userId = null;
  };

  const claimLocalActiveSession = async (): Promise<boolean> => {
    const localId = getOrCreateLocalSessionId();
    try {
      return await withTimeout(claimActiveSession(localId), 3000);
    } catch {
      return false;
    }
  };

  const claimAndStartGuard = (currentUser: User, retryDelayMs = 5000) => {
    claimLocalActiveSession().then((claimed) => {
      if (claimed) {
        startSessionGuard(currentUser);
        return;
      }
      window.setTimeout(() => {
        claimLocalActiveSession().then((retried) => {
          if (retried) startSessionGuard(currentUser);
        }).catch(() => undefined);
      }, retryDelayMs);
    }).catch(() => undefined);
  };

  const startSessionGuard = (currentUser: User) => {
    if (isMasterEmail(currentUser.email)) {
      stopSessionGuard();
      return;
    }
    if (guardRef.current.userId === currentUser.id) return;
    stopSessionGuard();

    const localId = getOrCreateLocalSessionId();
    guardRef.current.userId = currentUser.id;
    let mismatchCount = 0;
    let confirmingMismatch = false;

    const evaluateRemoteSession = async (remote: string | null | undefined) => {
      if (!remote) return;
      // Não derruba sessão enquanto a aba está em background ou há modal aberto.
      // Mobile/PWA dispara visibility/focus e remonta overlays com frequência;
      // confirmar depois evita falsos positivos e flicker do feed.
      if (typeof document !== 'undefined') {
        if (document.visibilityState !== 'visible') return;
        if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      }
      if (remote !== localId) {
        mismatchCount += 1;
        if (mismatchCount >= 3 && !confirmingMismatch) {
          confirmingMismatch = true;
          const confirmed = await fetchCurrentSessionId(currentUser.id);
          confirmingMismatch = false;
          if (confirmed && confirmed !== localId) {
            forceLogoutAsTakenOver();
          } else {
            mismatchCount = 0;
          }
        }
      } else {
        mismatchCount = 0;
      }
    };

    try {
      const unsub = subscribeTable('oculto_active_sessions', (payload: any) => {
        const row = payload?.new ?? payload?.old;
        if (!row || row.user_id !== currentUser.id) return;
        const next = payload?.new?.current_session_id ?? null;
        void evaluateRemoteSession(next);
      });
      guardRef.current.unsub = unsub;
    } catch (err) {
      console.warn('[singleSession] realtime subscribe failed', err);
    }

    const poll = async () => {
      const remote = await fetchCurrentSessionId(currentUser.id);
      await evaluateRemoteSession(remote);
    };
    guardRef.current.pollId = window.setInterval(poll, 90_000);
    poll();
  };



  useEffect(() => {
    let isMounted = true;

    // Limpa tokens locais corrompidos (ex.: "undefined"), evitando bad_jwt em /user
    const cleanCorruptedAuthTokens = (storage: Storage) => {
      Object.keys(storage).forEach((key) => {
        if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) return;

        try {
          const raw = storage.getItem(key);
          if (!raw) return;

          const parsed = JSON.parse(raw);
          const token = parsed?.access_token;
          const looksLikeJwt = typeof token === 'string' && token.split('.').length === 3;

          if (!looksLikeJwt) {
            storage.removeItem(key);
          }
        } catch {
          // Valor inválido no storage (não JSON, truncado etc.)
          storage.removeItem(key);
        }
      });
    };

    try {
      cleanCorruptedAuthTokens(localStorage);
      cleanCorruptedAuthTokens(sessionStorage);
    } catch {
      // ignore storage access errors
    }

    // ── Listener para MUDANÇAS CONTÍNUAS de auth (não controla isLoading) ──
    // Usa setTimeout(0) para evitar deadlock ao chamar Supabase dentro do callback
    const { data: { subscription } } = authClient.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        syncAuthState(session);

        // Single-session enforcement
        if (event === 'SIGNED_OUT' || !session?.user) {
          stopSessionGuard();
          // Garante que o próximo login (mesmo dispositivo) gere um session_id NOVO,
          // evitando que um id "fantasma" no localStorage cause auto-boot pelo guard.
          clearLocalSessionId();
          // CRÍTICO: limpa cache de queries do usuário anterior para evitar
          // que dados (incluindo flags de admin) vazem para o próximo login.
          purgeUserScopedCaches();
        } else if (session?.user) {
          if (event === 'SIGNED_IN') {
            // Contabiliza login REAL apenas uma vez por aba/sessão.
            // O Supabase dispara SIGNED_IN também ao recarregar a página
            // (rehidratação da sessão) — guardamos o uid em sessionStorage
            // para não inflar o contador a cada F5.
            try {
              const uid = session.user.id;
              const flagKey = 'login-counted:' + uid;
              if (sessionStorage.getItem(flagKey) !== '1') {
                sessionStorage.setItem(flagKey, '1');
                setTimeout(() => {
                  (supabase as any).rpc('increment_login_count').then((res: any) => {
                    if (res?.error) console.warn('[login-count] falhou:', res.error.message);
                  }).catch(() => {});
                }, 0);
              }
            } catch { /* sessionStorage indisponível */ }


            // Garante que o registro em `profiles` exista para esta conta.
            // Sem isso, a UI cai no fallback local e exibe "@usuario" / placeholders
            // porque `useProfile` não encontra linha em profiles.user_id = auth.uid.
            // A RPC `ensure_my_profile` é idempotente — se já existir, retorna
            // o id; se faltar, cria a linha base com o username de auth.metadata.
            setTimeout(() => {
              (supabase as any)
                .rpc('ensure_my_profile')
                .then(() => {
                  try {
                    const qcMod = (window as any).__lovableReactQueryClient;
                    if (qcMod?.invalidateQueries) {
                      qcMod.invalidateQueries({ queryKey: ['profile', session.user.id] });
                    }
                  } catch { /* noop */ }
                })
                .catch(() => { /* RPC opcional — useProfile re-tenta */ });
            }, 0);

            // novo login → toma posse da sessão
            setTimeout(() => {
              if (isMounted && session.user) claimAndStartGuard(session.user, 3000);
            }, 0);
            // Prefetch silencioso do feed após login bem-sucedido
            const uid = session.user.id;
            const warm = () => {
              import('@/pages/Index').catch(() => {});
              import('@/components/RealFeed').catch(() => {});
              import('@/lib/feedPrefetch')
                .then(({ warmFeedCache }) => warmFeedCache(uid))
                .catch(() => {});
            };
            if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
              (window as any).requestIdleCallback(warm, { timeout: 2000 });
            } else {
              setTimeout(warm, 0);
            }
          } else if (event === 'TOKEN_REFRESHED') {
            // token renovado → só vigia
            setTimeout(() => {
              if (isMounted && session.user) startSessionGuard(session.user);
            }, 0);
          }
        }

        // Ghost likes: dispara fora do callback para evitar deadlock
        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          const delay = Math.floor(Math.random() * 10 * 60 * 1000) + 5 * 60 * 1000;
          setTimeout(() => {
            const trigger = event === 'SIGNED_IN' ? 'login' : 'returning';
            supabase.functions.invoke('ghost-like', {
              body: { user_id: session.user.id, trigger },
            }).catch(() => {});
          }, delay);
        }
      }
    );


    // ── CARGA INICIAL: controla isLoading, resolve antes de liberar o app ──
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await withTimeout(authClient.auth.getSession(), 12000);
        if (!isMounted) return;
        syncAuthState(session);
        if (session?.user) {
          // Sessão persistida: primeiro re-toma posse no backend, depois liga o guard.
          // Evita falso "session_taken_over" em reload mobile/rede lenta quando o
          // registro remoto ainda tem um session_id antigo.
          claimAndStartGuard(session.user, 6000);
        }
      } catch (err) {
        // Timeout/rede instável NÃO deve apagar sessão local nem causar feed vazio.
        // O cliente externo já tenta refresh com retry; aqui só liberamos a UI.
        if (isTransientAuthFailure(normalizeAuthError(err as Error))) {
          console.warn('[auth] inicialização transitória; mantendo sessão local para recuperação automática');
        } else {
          await clearPossiblyCorruptedSession();
          if (isMounted) syncAuthState(null);
        }
        if (!isMounted) return;
      } finally {
        if (isMounted) {
          setAuthReady(true);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      stopSessionGuard();
    };
  }, []);


  const signUp = async (email: string, password: string, name: string, username?: string, profileData: Record<string, any> = {}) => {
    // Client-side validation to save bandwidth on low-end devices
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: new Error('Formato de e-mail inválido.') };
    }
    if (!password || password.length < 6) {
      return { error: new Error('A senha deve ter no mínimo 6 caracteres.') };
    }
    if (!name || name.trim().length < 2) {
      return { error: new Error('O nome deve ter no mínimo 2 caracteres.') };
    }

    try {
      const redirectUrl = getAuthRedirectUrl('/auth/callback');
      const cleanName = name.trim();
      const fallbackUsername = email.split('@')[0] || `user_${Math.random().toString(36).slice(2, 8)}`;
      const normalizedUsername = (username || fallbackUsername)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30) || fallbackUsername;

      const attemptSignUp = async () => {
        return authClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              name: cleanName,
              full_name: cleanName,
              username: normalizedUsername,
              ...profileData,
            },
          },
        });
      };

      // Sempre começa com sessão local limpa para evitar token quebrado interferindo no signup
      await clearPossiblyCorruptedSession();

      // Bloqueio de e-mails reservados (Cemitério Jurídico)
      try {
        const { data: blocked } = await (authClient as any).rpc('is_email_blocked', {
          p_email: email,
        });
        if (blocked === true) {
          return {
            error: new Error(
              'Este e-mail não pode ser utilizado. Conta anterior foi excluída e o endereço está reservado por motivos de auditoria legal.',
            ),
          };
        }
      } catch {
        // se RPC indisponível, segue fluxo normal
      }

      let { error } = await attemptSignUp();

      // Fallback para erros transitórios/jwt corrompido em produção (ex.: Vercel)
      if (error && (/database error/i.test(error.message) || /bad_jwt|invalid jwt|token is malformed/i.test(error.message))) {
        await clearPossiblyCorruptedSession();
        await new Promise((resolve) => setTimeout(resolve, 600));
        const retry = await attemptSignUp();
        error = retry.error;
      }

      if (error) {
        console.error('Supabase signUp error:', error);
        let msg = error.message;
        if (msg.includes('already registered')) msg = 'Este e-mail já está cadastrado.';
        else if (msg.includes('Password')) msg = 'Senha muito fraca. Use pelo menos 6 caracteres.';
        else if (msg.includes('valid email')) msg = 'Formato de e-mail inválido.';
        else if (msg.includes('rate limit')) msg = 'Muitas tentativas. Aguarde um momento.';
        return { error: new Error(msg) };
      }

      // Telemetria de fraude (não bloqueia o fluxo)
      import('@/lib/activityLogger').then(({ logActivity }) => {
        logActivity('signup', { username: normalizedUsername });
      }).catch(() => undefined);

      return { error: null };
    } catch (err) {
      console.error('Unexpected signUp error:', err);
      const msg = err instanceof Error ? err.message : 'Falha inesperada no cadastro';
      return { error: new Error(msg) };
    }
  };

  const signIn = async (email: string, password: string) => {
    let response: Awaited<ReturnType<typeof authClient.auth.signInWithPassword>> | null = null;

    const attemptSignIn = async (timeoutMs: number) => {
      return await withTimeout(
        authClient.auth.signInWithPassword({
          email,
          password,
        }),
        timeoutMs,
      );
    };

    const shouldHardReset = () => {
      const diag = authDiagnostics.getState();
      return diag.consecutiveRefreshFailures >= 2;
    };

    // Tentativas com backoff progressivo — cobre janelas em que o GoTrue
    // está reiniciando ("reloading api with new configuration") e o backend
    // leva alguns segundos para responder. Total máximo: ~80s.
    const attempts: Array<{ timeout: number; backoffBefore: number; resetSession?: boolean }> = [
      { timeout: 20000, backoffBefore: 0,    resetSession: shouldHardReset() },
      { timeout: 22000, backoffBefore: 1500, resetSession: true },
      { timeout: 25000, backoffBefore: 2500, resetSession: false },
      { timeout: 28000, backoffBefore: 3500, resetSession: false },
    ];

    let normalizedError: Error | null = null;

    for (let i = 0; i < attempts.length; i += 1) {
      const { timeout, backoffBefore, resetSession } = attempts[i];
      try {
        if (backoffBefore > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, backoffBefore));
        }
        if (resetSession) {
          await clearPossiblyCorruptedSession();
        }
        response = await attemptSignIn(timeout);
        normalizedError = normalizeAuthError(response.error as Error | null);
      } catch (caught) {
        normalizedError = normalizeAuthError(caught as Error);
      }

      // Sucesso ou erro definitivo (credenciais inválidas, etc.) — encerra
      // imediatamente. Só repete em falhas transitórias (timeout/502/504/etc.).
      if (!normalizedError || !isTransientAuthFailure(normalizedError)) {
        break;
      }
    }

    if (!normalizedError) {
      import('@/lib/activityLogger').then(({ logActivity }) => {
        logActivity('login', {});
      }).catch(() => undefined);
    }

    return {
      error: normalizedError as Error | null,
      session: response?.data.session ?? null,
      user: response?.data.user ?? response?.data.session?.user ?? null,
    };
  };

  const signOut = async () => {
    stopSessionGuard();
    clearLocalSessionId();
    // Marca o usuário como offline ANTES de derrubar a sessão (caso contrário
    // o token já não vale e o UPDATE falha por RLS).
    try {
      await withTimeout(markCurrentUserOffline(), 2500);
    } catch {
      // ignore — não pode bloquear o logout
    }
    try {
      await withTimeout(authClient.auth.signOut({ scope: 'local' }), 4000);
    } catch {
      await clearPossiblyCorruptedSession();
    } finally {
      const previousUid = user?.id;
      syncAuthState(null);
      // Purga qualquer dado de usuário/admin do cache para que o próximo
      // login não enxergue informações da conta anterior.
      purgeUserScopedCaches(previousUid);
    }
  };


  return (
    <AuthContext.Provider value={{ user, session, loading, authReady, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

const FALLBACK_AUTH_CONTEXT: AuthContextType = {
  user: null,
  session: null,
  loading: true,
  authReady: false,
  signUp: async () => ({ error: new Error('AuthProvider não montado') }),
  signIn: async () => ({ error: new Error('AuthProvider não montado'), session: null, user: null }),
  signOut: async () => {},
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Em vez de derrubar a árvore com throw (que estourava o ErrorBoundary
    // do feed quando chunks lazy resolviam antes do provider hidratar),
    // devolvemos um shape neutro. O próximo render, já com o provider,
    // hidrata o estado real.
    if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
      console.warn('[useAuth] usado fora do AuthProvider — retornando contexto neutro');
    }
    return FALLBACK_AUTH_CONTEXT;
  }
  return context;
}
