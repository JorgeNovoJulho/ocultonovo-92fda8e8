/**
 * AdultMediaBlurOverlay
 * --------------------------------------------------------------
 * Aplica blur padrão por cima da mídia (foto/vídeo) quando o
 * autor marcou o post como +18 (posts.is_adult = true).
 *
 * - Estado global controlado pelo SafeBlurProvider (botão "Blur" no topo do feed).
 * - Tocar em "Mostrar" revela apenas este post (revealPost).
 * - Religar o blur global (toggleSafeBlur ON) volta a cobrir todos os posts,
 *   inclusive os que já tinham sido revelados manualmente.
 * - Enquetes / posts não +18 nunca chegam aqui (controle no caller).
 */
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSafeBlur } from '@/safe-blur/SafeBlurProvider';

interface Props {
  children: React.ReactNode;
  /** Se false, renderiza children direto (post não é +18 ou contexto bloqueia). */
  active: boolean;
  /** Necessário para sincronizar com o estado global de "revelados". */
  postId: string;
  className?: string;
}

export function AdultMediaBlurOverlay({ children, active, postId, className }: Props) {
  const { safeBlurOn, isRevealed, revealPost } = useSafeBlur();

  if (!active) return <>{children}</>;

  // Revelado = usuário clicou em "Mostrar" E o blur global ainda está ligado mas
  // este post específico foi liberado. Quando safeBlurOn=false, tudo aparece.
  // Quando safeBlurOn=true, só aparece se este post foi revelado.
  const revealed = !safeBlurOn || isRevealed(postId);

  return (
    <div className={cn('relative isolate overflow-hidden', className)}>
      {/*
        Children renderizam em fluxo normal — eles é que definem a altura
        do card (foto/vídeo/carrossel). Apenas a opacidade muda quando o
        post está coberto. Sem isso (ex.: wrapper absolute), o container
        colapsa para 0×0 e o card aparece preto.
      */}
      <div
        className="will-change-[opacity] transition-opacity"
        style={{
          opacity: revealed ? 1 : 0,
          pointerEvents: revealed ? 'auto' : 'none',
        }}
      >
        {children}
      </div>

      {!revealed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            revealPost(postId);
          }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 overflow-hidden bg-background text-foreground"
          style={{
            backgroundImage:
              'radial-gradient(circle at 28% 24%, hsl(var(--muted)) 0, transparent 34%), radial-gradient(circle at 72% 78%, hsl(var(--muted)) 0, transparent 38%), linear-gradient(135deg, hsl(var(--background)), hsl(var(--card)))',
            boxShadow: 'inset 0 0 0 9999px hsl(var(--background) / 0.72)',
          }}
          aria-label="Mostrar conteúdo adulto"
        >
          <span className="flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-400">
            <EyeOff className="h-3 w-3" /> +18
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold">
            <Eye className="h-3.5 w-3.5" /> Mostrar
          </span>
        </button>
      )}
    </div>
  );
}
