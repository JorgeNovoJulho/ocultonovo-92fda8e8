/**
 * MaintenancePage — tela pública leve exibida durante o Modo Manutenção.
 * Após 8s, faz logout local e redireciona para a landing page (/),
 * permitindo que o usuário tente entrar novamente.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMaintenanceState } from '@/hooks/useMaintenanceGate';
import { supabase } from '@/lib/supabaseExternal';
import { Wrench } from 'lucide-react';

const REDIRECT_AFTER_MS = 8000;

export default function MaintenancePage() {
  const { state } = useMaintenanceState();
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(REDIRECT_AFTER_MS / 1000));

  const goBackNow = async () => {
    // 1) Encerra sessão no servidor (global) — aguarda concluir
    try { await supabase.auth.signOut({ scope: 'global' }); } catch {}
    // 2) Limpa TODOS os tokens locais do Supabase (evita auto-restore da sessão)
    try {
      const wipe = (storage: Storage) => {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && (k.startsWith('sb-') || k.includes('supabase.auth'))) keys.push(k);
        }
        keys.forEach((k) => storage.removeItem(k));
      };
      wipe(localStorage);
      wipe(sessionStorage);
      sessionStorage.removeItem('oculto_forced_logout_v');
    } catch {}
    // 3) Sinaliza para o LoginPage não auto-redirecionar e força reload completo
    window.location.replace('/login?force=1');
  };



  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    const timeout = setTimeout(() => {
      goBackNow();
    }, REDIRECT_AFTER_MS);

    return () => {
      clearInterval(tick);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return (
    <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-5">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 border border-primary/20">
          <Wrench className="h-8 w-8 text-primary" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Oculto em manutenção</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {state.message}
          </p>
          <p className="text-sm text-muted-foreground">
            Estamos preparando uma experiência mais leve, inteligente e personalizada para você.
          </p>
        </div>
        <div className="pt-2 space-y-3">
          <button
            type="button"
            onClick={goBackNow}
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
          >
            Voltar agora
          </button>
          <p className="text-xs text-muted-foreground">
            Voltando automaticamente em{' '}
            <span className="font-semibold text-primary">{secondsLeft}s</span>…
          </p>
        </div>
        <div className="pt-4 border-t border-border/50">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">+18</span>
            Plataforma para maiores de idade
          </span>
        </div>
      </div>
    </main>
  );
}
