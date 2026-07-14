import { Loader2 } from "lucide-react";
import { getCurrentAppVersion } from "@/lib/appVersion";

interface PostLoginLoadingScreenProps {
  message?: string;
  hint?: string;
}

/**
 * Tela de carregamento dedicada exibida entre a Landing e o Feed
 * (e em qualquer rota protegida enquanto a sessão de auth é resolvida
 * ou enquanto chunks lazy estão sendo baixados).
 *
 * Reduz drasticamente a chance do usuário ver "tela preta" durante a
 * recuperação automática de falhas de chunk após deploy. Mostra também
 * a versão do app no rodapé — quando essa versão muda em produção, o
 * `appVersion` watcher invalida automaticamente os chunks antigos.
 */
export function PostLoginLoadingScreen({
  message = "Preparando sua experiência...",
  hint,
}: PostLoginLoadingScreenProps) {
  const version = getCurrentAppVersion();

  return (
    <div className="min-h-dvh w-full bg-background flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
      {/* glow decorativo sutil — usa tokens semânticos */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 35%, hsl(var(--primary) / 0.18) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shadow-lg">
            <Loader2 className="h-8 w-8 text-primary-foreground animate-spin" />
          </div>
        </div>

        <div className="space-y-1.5 max-w-xs">
          <p className="text-sm font-semibold text-foreground tracking-wide">
            {message}
          </p>
          {hint && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {hint}
            </p>
          )}
        </div>

        <div className="flex gap-1.5 mt-2" aria-hidden>
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" />
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 z-10 text-center">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-mono">
          Oculto · v{version}
        </p>
      </div>
    </div>
  );
}

export default PostLoginLoadingScreen;
