/**
 * ViewModeMigrationModal — modal único exibido para usuários antigos
 * após a atualização dos Modos de Visualização.
 *
 * Não trava navegação (pode ser fechado), não aparece em loop e respeita
 * has_seen_view_mode_modal / modal_snoozed_until em
 * oculto_user_experience_preferences.
 *
 * Decisões:
 *  - "Usar Modo Simples"      -> view_mode='simple'   + markSeen + fecha
 *  - "Personalizar Agora"     -> view_mode='custom'   + abre CustomizeHomeSectionsModal
 *                                (marca como visto quando o usuário salvar)
 *  - "Ativar Universo Completo" -> view_mode='complete' + markSeen + fecha
 *  - "Decidir depois"         -> snooze 24h
 */
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Sliders, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useViewModePreferences } from '@/hooks/useViewModePreferences';
import { CustomizeHomeSectionsModal } from './CustomizeHomeSectionsModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}

type Choice = 'simple' | 'custom' | 'complete' | 'snooze' | null;

export function ViewModeMigrationModal({
  open,
  onOpenChange,
  title = 'O Oculto ficou mais leve e inteligente ✨',
  description = 'Agora você pode escolher como deseja visualizar sua experiência dentro da plataforma. Criamos três modos para deixar o Oculto mais fácil, rápido e adaptado ao seu jeito de explorar.',
}: Props) {
  const {
    setViewMode,
    markModalSeen,
    snoozeModal,
  } = useViewModePreferences();

  const [busy, setBusy] = useState<Choice>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const finishAndClose = async () => {
    try {
      await markModalSeen();
    } catch { /* silencioso */ }
    onOpenChange(false);
  };

  const choose = async (mode: 'simple' | 'complete') => {
    try {
      setBusy(mode);
      await setViewMode(mode);
      await markModalSeen();
      toast.success(mode === 'simple' ? 'Modo Simples ativado' : 'Universo Completo ativado');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível ativar agora.');
    } finally {
      setBusy(null);
    }
  };

  const personalize = async () => {
    try {
      setBusy('custom');
      await setViewMode('custom');
      setCustomizeOpen(true);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível abrir agora.');
    } finally {
      setBusy(null);
    }
  };

  const snooze = async () => {
    try {
      setBusy('snooze');
      // Snooze rápido (24h) — usa update direto para não depender do default 30d
      await snoozeModal(24);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível adiar agora.');
    } finally {
      setBusy(null);
    }
  };

  const cards = [
    {
      id: 'simple' as const,
      icon: Sparkles,
      title: 'Modo Simples',
      desc: 'Uma experiência mais limpa, rápida e direta. Ideal para navegar sem excesso de informações.',
      cta: 'Usar Modo Simples',
      onClick: () => choose('simple'),
    },
    {
      id: 'custom' as const,
      icon: Sliders,
      title: 'Modo Personalizado',
      desc: 'Escolha quais seções aparecem na sua página inicial. Você controla sua experiência em tempo real.',
      cta: 'Personalizar Agora',
      onClick: personalize,
    },
    {
      id: 'complete' as const,
      icon: Globe,
      title: 'Universo Completo',
      desc: 'Mostra todas as funções, seções e experiências do Oculto como a plataforma completa.',
      cta: 'Ativar Universo Completo',
      onClick: () => choose('complete'),
    },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="
            w-[calc(100vw-0.75rem)] sm:w-full max-w-[96vw] sm:max-w-xl
            max-h-[92dvh] p-0 rounded-2xl overflow-hidden
            flex flex-col gap-0
          "
        >
          {/* Área rolável invisível */}
          <div
            className="
              flex-1 min-h-0 overflow-y-auto overscroll-contain
              [scrollbar-width:none] [-ms-overflow-style:none]
              [&::-webkit-scrollbar]:hidden
            "
          >
            <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2 text-left">
              <DialogTitle className="text-base sm:text-lg leading-tight pr-8">
                {title}
              </DialogTitle>
              <DialogDescription className="text-[12px] sm:text-[13px] leading-relaxed">
                {description}
              </DialogDescription>
            </DialogHeader>

            <div className="px-4 sm:px-5 py-2 sm:py-3 grid gap-2 sm:gap-3">
              {cards.map((c) => {
                const Icon = c.icon;
                const isBusy = busy === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!!busy}
                    onClick={c.onClick}
                    className="
                      text-left rounded-xl border border-border/60 bg-card/40
                      p-3 transition-colors hover:border-primary/50
                      active:scale-[0.99]
                      disabled:opacity-60 disabled:cursor-not-allowed
                    "
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{c.title}</div>
                        <div className="text-[11.5px] sm:text-xs text-muted-foreground leading-snug mt-0.5">
                          {c.desc}
                        </div>
                        <div className="mt-2">
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                            {isBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                            {c.cta} →
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="h-2" />
          </div>

          {/* Footer fixo — botão "Decidir depois" sempre visível */}
          <DialogFooter
            className="
              shrink-0 px-4 sm:px-5 py-2.5 sm:py-3 border-t bg-background/95 backdrop-blur
              flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2
              pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))]
            "
          >
            <p className="text-[10.5px] sm:text-[11px] text-muted-foreground text-center sm:text-left leading-snug">
              Você pode alterar isso depois em{' '}
              <strong>Configurações &gt; Experiência do Oculto</strong>.
            </p>
            <Button
              size="sm"
              disabled={!!busy}
              onClick={snooze}
              className="w-full sm:w-auto shrink-0 font-bold text-black border-0 shadow-[0_4px_14px_-4px_hsl(45_93%_47%_/_0.6)] bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:from-amber-400 hover:via-yellow-500 hover:to-amber-600 hover:text-black focus-visible:ring-amber-400"
            >
              {busy === 'snooze' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Decidir depois
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomizeHomeSectionsModal
        open={customizeOpen}
        onOpenChange={(v) => {
          setCustomizeOpen(v);
          if (!v) {
            // se o usuário fechou sem salvar, o modal de migração ainda
            // será dispensado para não virar loop.
            void finishAndClose();
          }
        }}
        onSaved={() => {
          void finishAndClose();
        }}
      />
    </>
  );
}
