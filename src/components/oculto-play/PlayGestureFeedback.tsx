/**
 * PlayGestureFeedback — Etapa 43
 *
 * Mostra feedback visual rápido (animação fade) ao usuário quando
 * um gesto é reconhecido (double-tap seek). Auto-desmonta após 700ms.
 */
import { useEffect, useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GestureFeedbackState {
  key: number;
  side: 'left' | 'right';
  delta: number;
}

interface Props {
  state: GestureFeedbackState | null;
}

export function PlayGestureFeedback({ state }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!state) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 650);
    return () => window.clearTimeout(t);
  }, [state?.key]);

  if (!state) return null;

  const Icon = state.side === 'left' ? RotateCcw : RotateCw;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-y-0 z-30 grid place-items-center transition-opacity duration-300',
        state.side === 'left' ? 'left-0 w-1/2' : 'right-0 w-1/2',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="flex flex-col items-center gap-1 rounded-full bg-black/55 px-5 py-3 text-white">
        <Icon className="h-7 w-7" />
        <span className="text-xs font-semibold">
          {state.delta > 0 ? `+${state.delta}s` : `${state.delta}s`}
        </span>
      </div>
    </div>
  );
}
