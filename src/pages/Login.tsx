import { forwardRef, useEffect, useState as useStateReact, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { Eye, EyeOff, Loader2, Sparkles, ShieldCheck, WifiOff } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showHighlightToast } from "@/lib/highlightToast";
// LivenessCheckModal: lazy — only loaded when a creator triggers liveness verification
const LivenessCheckModal = lazy(() =>
  import("@/components/LivenessCheckModal").then(m => ({ default: m.LivenessCheckModal }))
);
import { supabase } from "@/lib/supabaseExternal";
import { readLoginCache, writeLoginCache } from "@/lib/loginCache";
import { loginMetrics } from "@/lib/loginMetrics";
import { LoginRedirectSkeleton } from "@/components/LoginRedirectSkeleton";
import { BackendHealthBanner, useBackendHealthStatus } from "@/components/BackendHealthBanner";
import { AuthStatusIndicator } from "@/components/AuthStatusIndicator";
import { authDiagnostics } from "@/lib/authDiagnostics";

/**
 * Prefetch silencioso dos dados mais usados após o login.
 * Roda em background (sem await) — qualquer falha é ignorada.
 */
function prefetchPostLoginData(userId: string) {
  const fire = () => {
    try {
      // 1) Página de destino e bundle do feed (parse antecipado)
      import('@/pages/Index').catch(() => {});
      import('@/components/RealFeed').catch(() => {});

      // 2) Profile completo do usuário logado (popula useProfile)
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
        .then((res) => {
          if (res?.data) {
            import('@/store/useFeedCacheStore')
              .then(({ useFeedCacheStore }) => {
                useFeedCacheStore.getState().setProfiles([res.data as any]);
              })
              .catch(() => {});
          }
        }, () => {});

      // 3) Pré-aquece a primeira página do feed + autores em paralelo,
      //    populando o Zustand cache para pintura imediata em /feed
      Promise.all([
        supabase
          .from('posts')
          .select('id, author_id, creator_id, created_at, content, media_url, media_type')
          .order('created_at', { ascending: false })
          .limit(20),
      ])
        .then(async ([postsRes]) => {
          const posts = (postsRes?.data as any[]) || [];
          if (!posts.length) return;
          const authorIds = Array.from(
            new Set(posts.map((p) => p.author_id).filter(Boolean)),
          );
          let profiles: any[] = [];
          if (authorIds.length) {
            const { data } = await supabase
              .from('profiles')
              .select('id, user_id, username, name, avatar_url, plan_type, is_vip, is_creator, is_verified')
              .in('id', authorIds);
            profiles = data || [];
          }
          const profileById = new Map(profiles.map((p) => [p.id, p]));
          const enriched = posts.map((p) => {
            const prof = profileById.get(p.author_id);
            return prof ? { ...p, username: prof.username, name: prof.name, avatar_url: prof.avatar_url } : p;
          });
          const { useFeedCacheStore } = await import('@/store/useFeedCacheStore');
          const store = useFeedCacheStore.getState();
          if (profiles.length) store.setProfiles(profiles);
          store.setPosts(enriched, userId);
        })
        .catch(() => {});
    } catch { /* silencioso */ }
  };
  // Dispara imediatamente para reduzir "buracos" pós-login.
  // Antes usávamos requestIdleCallback(1500ms), mas isso atrasava o warm do cache
  // e o feed abria vazio esperando a rede. Agora dispara já.
  try { fire(); } catch { /* noop */ }
}


type AuthFeedback = {
  tone: "info" | "error";
  title: string;
  description: string;
  technicalDetails?: string;
  showTechnicalDetails?: boolean;
};

const getAuthFeedbackFromError = (error: any): AuthFeedback => {
  const message = String(error?.message || "Falha desconhecida na autenticação.");
  const code = typeof error?.code === "string" ? error.code : undefined;
  const status = typeof error?.status !== "undefined" ? String(error.status) : undefined;
  const technicalDetails = [code ? `Código: ${code}` : null, status ? `Status: ${status}` : null]
    .filter(Boolean)
    .join(" · ");

  const isTimeoutLike =
    code === "auth_timeout" ||
    status === "502" ||
    status === "503" ||
    status === "504" ||
    status === "522" ||
    /Failed to fetch/i.test(message) ||
    /network request failed/i.test(message) ||
    /retornou HTML em vez de JSON/i.test(message) ||
    /timeout/i.test(message) ||
    /\b52[0234]\b/.test(message) ||
    /\b504\b/.test(message);

  const technicalDetailsAllowed = !isTimeoutLike;

  if (/Invalid login credentials/i.test(message)) {
    return {
      tone: "error",
      title: "Credenciais inválidas",
      description: "O e-mail não existe ou a senha informada está incorreta.",
      technicalDetails,
      showTechnicalDetails: technicalDetailsAllowed,
    };
  }

  if (/Email not confirmed/i.test(message)) {
    return {
      tone: "error",
      title: "E-mail não confirmado",
      description: "Confirme seu e-mail antes de entrar na plataforma.",
      technicalDetails,
      showTechnicalDetails: technicalDetailsAllowed,
    };
  }

  if (/Database error querying schema/i.test(message) || code === "unexpected_failure") {
    return {
      tone: "error",
      title: "Falha interna no schema de autenticação",
      description: "O backend rejeitou este login por inconsistência no registro interno do usuário.",
      technicalDetails: [technicalDetails, "Motivo real: Database error querying schema"].filter(Boolean).join(" · "),
      showTechnicalDetails: true,
    };
  }

  if (/rate limit/i.test(message)) {
    return {
      tone: "error",
      title: "Muitas tentativas",
      description: "Aguarde alguns instantes antes de tentar entrar novamente.",
      technicalDetails,
      showTechnicalDetails: technicalDetailsAllowed,
    };
  }

  if (isTimeoutLike) {
    return {
      tone: "info",
      title: "Servidor temporariamente indisponível",
      description: "Seu acesso não foi recusado. O servidor de autenticação não respondeu a tempo. Tente novamente em alguns instantes.",
      technicalDetails: technicalDetailsAllowed ? [technicalDetails, message].filter(Boolean).join(" · ") : undefined,
      showTechnicalDetails: false,
    };
  }

  return {
    tone: "error",
    title: "Erro ao entrar",
    description: message,
    technicalDetails,
    showTechnicalDetails: true,
  };
};

/** Tiny component: checks admin role then redirects accordingly */
function AdminAwareRedirect({ userId, email }: { userId: string; email?: string }) {
  const [target, setTarget] = useStateReact<string | null>(null);

  useEffect(() => {
    // 1) Instant redirect for known admin email (zero RPC latency)
    if (email === 'ocultomaster@gmail.com') {
      setTarget('/admin-dashboard');
      return;
    }
    // 2) Cache local — evita hit no DB se já checamos recentemente
    const cached = readLoginCache(userId);
    if (cached) {
      setTarget(cached.isAdmin ? '/admin-dashboard' : '/feed');
      // Prefetch silencioso mesmo no redirect rápido
      prefetchPostLoginData(userId);
      return;
    }
    // 3) Fallback: RPC normal — COM TIMEOUT.
    // Mobile/rede flaky às vezes deixa o RPC pendurado; se passar de 2.5s
    // assumimos não-admin e mandamos pro /feed (evita "skeleton infinito"
    // que prendia usuários no login).
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled) return;
      writeLoginCache(userId, { isAdmin: false, isCreator: false, isVerified: false });
      setTarget('/feed');
      prefetchPostLoginData(userId);
    }, 2500);
    (async () => {
      const { data, error } = await supabase.rpc('is_admin', { _user_id: userId });
      if (cancelled) return;
      window.clearTimeout(fallbackTimer);
      const isAdmin = !error && data === true;
      writeLoginCache(userId, { isAdmin, isCreator: false, isVerified: false });
      setTarget(isAdmin ? '/admin-dashboard' : '/feed');
      prefetchPostLoginData(userId);
    })();
    return () => { cancelled = true; window.clearTimeout(fallbackTimer); };
  }, [userId, email]);

  if (!target) {
    return <LoginRedirectSkeleton message="Reconectando sua sessão..." step={2} totalSteps={3} />;
  }
  return <Navigate to={target} replace />;
}

const Login = forwardRef<HTMLDivElement, object>(function Login(_props, _ref) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const [authFeedback, setAuthFeedback] = useState<AuthFeedback | null>(null);
  const [showLivenessModal, setShowLivenessModal] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const { user, loading, authReady, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const backendHealth = useBackendHealthStatus();

  // ?force=1 → vindo da tela de Manutenção: NUNCA auto-redirecionar,
  // mesmo se houver sessão remanescente em memória. Limpa tudo e mostra o form.
  const [forceLoginMode] = useStateReact(() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('force') === '1';
    } catch { return false; }
  });

  useEffect(() => {
    if (!forceLoginMode) return;
    // Garante sessão zerada quando o usuário foi enviado da manutenção
    signOut().catch(() => {});
    try {
      const wipe = (storage: Storage) => {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && (k.startsWith('sb-') || k.includes('supabase'))) keys.push(k);
        }
        keys.forEach((k) => storage.removeItem(k));
      };
      wipe(localStorage);
      wipe(sessionStorage);
    } catch { /* ignore */ }
  }, [forceLoginMode, signOut]);


  // Aviso quando o usuário caiu aqui por outra sessão ter assumido seu acesso
  const [sessionTakenOver, setSessionTakenOver] = useStateReact(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reason') === 'session_taken_over') {
        setSessionTakenOver(true);
        params.delete('reason');
        const qs = params.toString();
        window.history.replaceState({}, '', `/login${qs ? `?${qs}` : ''}`);
      }
      if (params.get('reason') === 'refresh_loop') {
        setAuthFeedback({
          tone: "info",
          title: "Sessão expirada — reconecte-se",
          description: "Detectamos timeouts repetidos (504) ao renovar seu token. Limpamos sua sessão local para evitar travamentos. Faça login novamente.",
        });
        params.delete('reason');
        const qs = params.toString();
        window.history.replaceState({}, '', `/login${qs ? `?${qs}` : ''}`);
      }
    } catch {
      // ignore
    }
  }, []);

  // Auto-recuperação: se o fetch global detectar refresh loop (≥3 falhas
  // seguidas), limpamos sessão e mostramos mensagem clara em vez de travar.
  useEffect(() => {
      const unsub = authDiagnostics.subscribe((state) => {
      if (state.consecutiveRefreshFailures >= 3 && !isLoading && !redirecting) {
        authDiagnostics.recordAutoRecovery(`auto: ${state.refreshFailureCount} falhas seguidas`);
        signOut().catch(() => { /* ignore */ });
        setAuthFeedback({
          tone: "info",
          title: "Recuperação automática ativada",
          description: "Detectamos várias falhas (504) ao renovar seu token. Sua sessão local foi limpa — tente entrar novamente em alguns instantes.",
        });
      }
    });
    return unsub;
  }, [isLoading, redirecting, signOut]);

  const handleRecover = async () => {
    try {
      authDiagnostics.recordAutoRecovery('manual: usuário clicou em limpar sessão');
      authDiagnostics.reset();
      await signOut();
      setAuthFeedback({
        tone: "info",
        title: "Sessão local limpa",
        description: "Tokens antigos foram removidos. Tente entrar novamente.",
      });
    } catch {
      /* ignore */
    }
  };






  // Show loading while checking auth state — pulado em forceLoginMode
  if (!forceLoginMode && (loading || !authReady)) {
    return <LoginRedirectSkeleton message="Verificando sua sessão..." step={1} totalSteps={3} />;
  }

  // Redirect if already authenticated — admin goes to dashboard
  // (ignorado quando forceLoginMode=1 — usuário veio da tela de manutenção)
  if (user && !forceLoginMode) {
    return <AdminAwareRedirect userId={user.id} email={user.email} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast({
        title: "Preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    loginMetrics.start();
    setIsLoading(true);
    setLoadingStep(1);
    setLoadingMessage("Validando credenciais...");
    setAuthFeedback({
      tone: "info",
      title: "Entrando...",
      description: "Estamos verificando seu acesso com segurança.",
    });

    try {
      const { error, session } = await signIn(email, password);
      loginMetrics.mark('signIn');

      if (error) {
        console.error('[Login] Auth error:', error.message, '| Code:', (error as any)?.code, '| Status:', (error as any)?.status);
        const feedback = getAuthFeedbackFromError(error);
        setAuthFeedback(feedback);

        if (feedback.tone === "error") {
          toast({
            title: feedback.title,
            description: feedback.technicalDetails
              ? `${feedback.description} ${feedback.technicalDetails}`
              : feedback.description,
            variant: "destructive",
          });
        }
        return;
      }

      // Mostra skeleton premium imediatamente após autenticar
      setRedirecting(true);
      setLoadingStep(2);
      setLoadingMessage("Preparando seu acesso...");

      // Fast-path: known master admin email skips all extra RPCs
      if (email.trim().toLowerCase() === 'ocultomaster@gmail.com') {
        loginMetrics.mark('fastpath-master');
        loginMetrics.report();
        showHighlightToast({
          title: "Bem-vindo, Administrador! 🔐",
          description: "Redirecionando para o painel de controle.",
        });
        navigate("/admin-dashboard");
        return;
      }

      loginMetrics.mark('getSession');

      if (session?.user) {
        const uid = session.user.id;

        // Tenta cache antes de bater no DB
        const cached = readLoginCache(uid);
        let profile: { is_creator?: boolean; is_verified?: boolean } | null = null;
        let isAdmin: boolean | null = null;
        let profileError: unknown = null;

        if (cached) {
          loginMetrics.mark('cache-hit');
          profile = { is_creator: cached.isCreator, is_verified: cached.isVerified };
          isAdmin = cached.isAdmin;
          // Inicia prefetch do feed imediatamente
          prefetchPostLoginData(uid);
        } else {
          setLoadingStep(3);
          setLoadingMessage("Verificando acesso do perfil...");
          const accessChecks = await Promise.race<[
            PromiseSettledResult<any>,
            PromiseSettledResult<any>
          ] | null>([
            Promise.allSettled([
              supabase
                .from('profiles')
                .select('is_creator, is_verified')
                .eq('user_id', uid)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle(),
              supabase.rpc('is_admin', { _user_id: uid }),
            ]) as Promise<[PromiseSettledResult<any>, PromiseSettledResult<any>]>,
            new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4500)),
          ]);

          if (accessChecks) {
            const [profileSettled, adminSettled] = accessChecks;
            loginMetrics.mark('profile+isAdmin');

            if (profileSettled.status === 'fulfilled') {
              profile = (profileSettled.value.data as any) ?? null;
              profileError = profileSettled.value.error;
            } else {
              profileError = profileSettled.reason;
            }

            if (adminSettled.status === 'fulfilled') {
              isAdmin = adminSettled.value.data === true;
            }

            writeLoginCache(uid, {
              isAdmin: !!isAdmin,
              isCreator: !!profile?.is_creator,
              isVerified: !!profile?.is_verified,
            });
          } else {
            profileError = new Error('post_login_access_timeout');
            loginMetrics.mark('post-login-fallback');
          }

          // Prefetch em background dos dados pós-login
          prefetchPostLoginData(uid);
        }

        // If creator and not verified, require liveness check
        if (profile?.is_creator && !profile?.is_verified) {
          loginMetrics.mark('liveness-required');
          loginMetrics.report();
          setPendingUserId(uid);
          setShowLivenessModal(true);
          setRedirecting(false);
          setIsLoading(false);
          return;
        }

        setLoadingStep(4);
        setLoadingMessage("Direcionando seu acesso...");

        if (isAdmin === true) {
          loginMetrics.mark('redirect-admin');
          loginMetrics.report();
          showHighlightToast({
            title: "Bem-vindo, Administrador! 🔐",
            description: "Redirecionando para o painel de controle.",
          });
          navigate("/admin-dashboard");
          return;
        }

        // IMPORTANTE: NÃO criar perfil aqui via upsert direto.
        // `profiles.id` ≠ `auth.uid` na maioria dos usuários (a chave canônica
        // é `user_id`). O upsert antigo com `id: uid` criava LINHA DUPLICADA
        // sem `username`, fazendo o feed exibir "Usuário" em vez do @handle
        // correto. O `useProfile` já trata o caso de perfil ausente com
        // fallback local + re-tentativa via invalidateQueries.
      }

      setAuthFeedback(null);
      loginMetrics.mark('redirect-feed');
      loginMetrics.report();

      toast({
        title: "Bem-vindo de volta! 🖤",
        description: "Login realizado com sucesso.",
        duration: 5000,
      });
      navigate("/feed");
    } catch (error) {
      const feedback = getAuthFeedbackFromError(error);
      setAuthFeedback(feedback);
      setRedirecting(false);
      if (feedback.tone === "error") {
        toast({
          title: feedback.title,
          description: feedback.technicalDetails
            ? `${feedback.description} ${feedback.technicalDetails}`
            : feedback.description,
          variant: "destructive",
        });
      }
    } finally {
      setLoadingMessage("");
      setIsLoading(false);
    }
  };

  const handleLivenessSuccess = async () => {
    if (pendingUserId) {
      await supabase
        .from('profiles')
        .update({ is_verified: true } as any)
        .eq('id', pendingUserId);
    }
    setShowLivenessModal(false);
    setPendingUserId(null);
    toast({
      title: "Verificação concluída! ✓",
      description: "Bem-vindo de volta!",
      duration: 5000,
    });
    navigate("/feed");
  };

  const handleLivenessFailure = async () => {
    setShowLivenessModal(false);
    setPendingUserId(null);
    await signOut();
    toast({
      title: "Verificação necessária",
      description: "Criadores precisam completar a verificação biométrica para acessar a plataforma.",
      variant: "destructive",
    });
  };

  // Skeleton premium de redirecionamento — substitui o form quando autenticado
  if (redirecting) {
    return (
      <LoginRedirectSkeleton
        message={loadingMessage || "Preparando seu acesso..."}
        step={loadingStep || 2}
        totalSteps={4}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
        <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-72 h-72 bg-secondary/10 rounded-full blur-3xl" />
        {/* subtle radial vignette + grain feel */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,hsl(var(--background))_100%)]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        {/* +18 badge floating */}
        <div className="flex justify-center mb-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary backdrop-blur">
            <ShieldCheck className="h-3 w-3" />
            Rede Adulta · Apenas +18
          </span>
        </div>

        {/* Glassmorphism card */}
        <div className="backdrop-blur-xl bg-card/80 border border-border/50 rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Logo />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-center text-foreground mb-2 leading-tight">
            O que está <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">oculto</span> em você
            <br className="hidden sm:block" /> espera o seu retorno.
          </h1>
          <p className="text-muted-foreground text-center mb-2 text-sm">
            Entre na rede adulta mais desejada do Brasil — onde desejos reais encontram pessoas reais, sem julgamento, sem máscaras.
          </p>
          <p className="text-center mb-7 text-[11px] text-muted-foreground/80 flex items-center justify-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            Acesso exclusivo para maiores de 18 anos verificados.
          </p>

          <BackendHealthBanner
            status={backendHealth.status}
            checking={backendHealth.checking}
            check={backendHealth.check}
          />

          {email.trim().toLowerCase() === 'ocultomaster@gmail.com' && (
            <AuthStatusIndicator
              status={backendHealth.status}
              checking={backendHealth.checking}
              onRecover={handleRecover}
            />
          )}


          {sessionTakenOver && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground"
            >
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden />
                <div className="space-y-2">
                  <p className="font-semibold text-destructive">
                    Sua sessão foi encerrada
                  </p>
                  <p className="text-foreground/80 leading-relaxed">
                    Detectamos que sua conta foi acessada em <strong>outro dispositivo ou
                    localidade</strong>. Por segurança, permitimos apenas uma sessão ativa por vez —
                    a sessão anterior foi automaticamente desconectada. Se não foi você, troque a
                    senha imediatamente.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setSessionTakenOver(false);
                      requestAnimationFrame(() => {
                        const el = document.getElementById('email') as HTMLInputElement | null;
                        el?.focus();
                      });
                    }}
                  >
                    Tentar entrar novamente
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (authFeedback?.tone === "error") setAuthFeedback(null);
                }}
                className="h-12 bg-muted/30 border-border/50 focus:border-primary"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (authFeedback?.tone === "error") setAuthFeedback(null);
                  }}
                  className="h-12 bg-muted/30 border-border/50 focus:border-primary pr-12"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {authFeedback && !(authFeedback.tone === "info" && backendHealth.status === "down") && (
              <div
                aria-live="polite"
                className={[
                  "rounded-lg border px-4 py-3 text-sm",
                  authFeedback.tone === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-primary/30 bg-primary/10 text-foreground",
                ].join(" ")}
              >
                <p className="font-semibold">{authFeedback.title}</p>
                <p className="mt-1 text-current/90">{authFeedback.description}</p>
                {authFeedback.showTechnicalDetails !== false && authFeedback.technicalDetails && (
                  <p className="mt-2 text-xs text-current/80">{authFeedback.technicalDetails}</p>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                Esqueceu a senha?
              </Link>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {loadingMessage || "Entrando..."}
                </span>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          {/* Sign up link */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            Ainda não faz parte?{" "}
            <Link to="/signup" className="text-primary hover:underline font-semibold">
              Solicitar acesso
            </Link>
          </p>
          <p className="text-center text-[10px] text-muted-foreground/70 mt-2">
            Comunidade verificada · Privacidade absoluta · Sem rastros
          </p>

          {/* Acesso offline ao Oculto Play (funciona sem internet) */}
          <div className="mt-6 flex flex-col items-center gap-2">
            {isOffline && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.35)]"
              >
                <WifiOff className="h-3.5 w-3.5 animate-pulse" />
                Você está offline — toque abaixo para ouvir o que já baixou.
              </div>
            )}
            <Link
              to="/oculto-play/offline"
              className={
                isOffline
                  ? "inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-400 px-5 py-2.5 text-sm font-bold text-black shadow-[0_0_22px_rgba(251,191,36,0.65)] ring-2 ring-amber-200/60 hover:bg-amber-300 active:scale-[0.98] transition"
                  : "inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 transition"
              }
              title="Ouvir músicas salvas sem internet"
            >
              {isOffline ? <WifiOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {isOffline ? "Abrir Modo Offline" : "Acessar Oculto Play offline"}
            </Link>
          </div>
        </div>
      </div>

      {/* Liveness Check Modal for Creators */}
      {showLivenessModal && (
        <Suspense fallback={null}>
          <LivenessCheckModal
            open={showLivenessModal}
            onOpenChange={(open) => {
              if (!open) handleLivenessFailure();
            }}
            onSuccess={handleLivenessSuccess}
            onFailure={handleLivenessFailure}
          />
        </Suspense>
      )}
    </div>
  );
});
Login.displayName = "Login";
export default Login;
