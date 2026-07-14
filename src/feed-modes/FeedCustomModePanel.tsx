import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

import { Settings2, RotateCcw, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFeedMode } from './FeedModeProvider';
import { FEED_MODES, FEED_WIDGET_LABELS, type FeedWidgetKey } from './modes.config';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** Painel do modo Personalizado — toggles widget-a-widget com persistência
 *  realtime (otimista + RPC + Realtime cross-device pelo provider).
 *  Default (sem override) = mesmas funções do modo "Limpo" (simples). */
export function FeedCustomModePanel({ open, onOpenChange }: Props) {
  const { customWidgets, setCustomWidget, savingWidget, saveState } = useFeedMode();
  // Listagem completa = todos os widgets do modo Completo.
  const keys = Array.from(FEED_MODES.completo) as FeedWidgetKey[];

  const isEnabled = (key: FeedWidgetKey) => {
    const override = customWidgets[key];
    if (override !== undefined) return !!override;
    return FEED_MODES.limpo.has(key); // default = Limpo
  };

  const resetToLimpo = async () => {
    for (const k of keys) {
      const target = FEED_MODES.limpo.has(k);
      await setCustomWidget(k, target);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 overflow-hidden flex flex-col w-[calc(100vw-1rem)] sm:w-full max-w-md max-h-[90dvh] sm:max-h-[85dvh]"
      >
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base min-w-0">
            <Settings2 className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Modo Personalizado</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ative ou desative cada bloco do feed. Tudo é salvo em tempo real, em todos os seus dispositivos.
            O padrão inicial é igual ao modo <strong>Limpo</strong> — você pode liberar tudo do modo Completo.
          </DialogDescription>
          <div className="pt-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetToLimpo}
              className="h-7 px-2 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Restaurar padrão (Limpo)
            </Button>
            <div
              className="text-[11px] flex items-center gap-1 transition-opacity duration-200"
              style={{ opacity: saveState === 'idle' ? 0 : 1 }}
              aria-live="polite"
              role="status"
            >
              {saveState === 'saving' && (
                <><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-primary">Salvando…</span></>
              )}
              {saveState === 'saved' && (
                <><Check className="h-3 w-3 text-emerald-500" /><span className="text-emerald-500">Aplicado no feed</span></>
              )}
              {saveState === 'error' && (
                <><AlertCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">Salvo localmente</span></>
              )}
            </div>
          </div>
        </DialogHeader>
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <ul className="divide-y divide-border/30 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {keys.map((key) => {
              const meta = FEED_WIDGET_LABELS[key];
              const enabled = isEnabled(key);
              const isSaving = savingWidget === key;
              return (
                <li key={key} className="flex items-start gap-3 px-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {meta?.label ?? key}
                      {isSaving && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    </p>
                    {meta?.description && (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {meta.description}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => setCustomWidget(key, v)}
                    aria-label={`Ativar/desativar ${meta?.label ?? key}`}
                  />
                </li>
              );
            })}
          </ul>
        </div>

      </DialogContent>
    </Dialog>
  );
}
