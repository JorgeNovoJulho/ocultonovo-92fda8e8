/**
 * AuthCallbackPage — destino do redirect OAuth.
 * Processa code/fragmento, troca por sessão e redireciona.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const callbackError = url.searchParams.get('error') || url.hash.match(/error=([^&]+)/)?.[1] || null;

        if (code) {
          try {
            await (supabase.auth as any).exchangeCodeForSession(window.location.href);
          } catch (err) {
            console.warn('[AuthCallback] exchangeCodeForSession falhou:', err);
          }
        }

        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session?.user) {
          if (!cancelled) navigate('/login?error=oauth', { replace: true });
          return;
        }

        if (cancelled) return;
        navigate('/feed', { replace: true });
      } catch (err) {
        console.error('[AuthCallback] erro:', err);
        if (!cancelled) navigate('/login?error=oauth', { replace: true });
      }
    };

    run();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-6">
      <div className="text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Concluindo entrada...</p>
      </div>
    </div>
  );
}
