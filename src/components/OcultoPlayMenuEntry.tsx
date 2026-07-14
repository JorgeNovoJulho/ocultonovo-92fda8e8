/**
 * OcultoPlayMenuEntry — entrada de menu para OCULTO PLAY (Etapa 4 / 5 / 6).
 *
 * Renderiza APENAS se a flag estiver liberada para o usuário atual.
 * Quando não renderiza, não dispara queries pesadas — apenas o gate leve.
 */
import { Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useOcultoPlayEnabled } from '@/hooks/useOcultoPlayEnabled';

interface Props {
  variant: 'sidebar' | 'mobile';
  isActive?: boolean;
  onClick?: () => void;
}

export function OcultoPlayMenuEntry({ variant, isActive, onClick }: Props) {
  const { isEnabledForCurrentUser, isMasterPreview, isPublicEnabled } = useOcultoPlayEnabled();
  if (!isEnabledForCurrentUser) return null;

  const baseClass = cn(
    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
    isActive
      ? 'bg-fuchsia-500/15 text-fuchsia-200'
      : 'text-foreground/80 hover:bg-accent/50'
  );

  const inner = (
    <>
      <Play
        className={cn(
          'h-5 w-5 shrink-0',
          isActive ? 'text-fuchsia-300' : 'text-fuchsia-400'
        )}
      />
      <span className="flex-1 text-left">OCULTO PLAY</span>
      {!isPublicEnabled && isMasterPreview ? (
        <Badge className="bg-fuchsia-500/25 text-fuchsia-200 text-[9px] font-bold border-0 h-4 px-1.5">
          BETA
        </Badge>
      ) : (
        <Badge className="bg-fuchsia-500/20 text-fuchsia-300 text-[9px] font-bold border-0 h-4 px-1.5">
          NOVO
        </Badge>
      )}
    </>
  );

  if (variant === 'sidebar') {
    return (
      <button onClick={onClick} className={baseClass}>
        {inner}
      </button>
    );
  }

  return (
    <Link to="/oculto-play" onClick={onClick} className={baseClass}>
      {inner}
    </Link>
  );
}
