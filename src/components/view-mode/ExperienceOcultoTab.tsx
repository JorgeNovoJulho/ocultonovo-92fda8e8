/**
 * Aba "Experiência do Oculto" nas Configurações.
 * Permite trocar entre Simples / Personalizado / Universo Completo.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Sliders, Globe, Check, Flame, Globe2, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useViewModePreferences } from '@/hooks/useViewModePreferences';
import { useFeedExperienceMode } from '@/hooks/useFeedExperienceMode';
import { useFeedSyncIndicatorPref } from '@/hooks/useFeedSyncIndicatorPref';
import { CustomizeHomeSectionsModal } from './CustomizeHomeSectionsModal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function ExperienceOcultoTab() {
  const { viewMode, isLoading, resetToSimple, enableComplete, setViewMode } = useViewModePreferences();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (mode: 'simple' | 'custom' | 'complete') => {
    try {
      setBusy(mode);
      if (mode === 'simple') await resetToSimple();
      else if (mode === 'complete') await enableComplete();
      else {
        await setViewMode('custom');
        setOpen(true);
      }
      if (mode !== 'custom') toast.success('Modo atualizado');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível alterar agora.');
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
      cta: 'Ativar Modo Simples',
    },
    {
      id: 'custom' as const,
      icon: Sliders,
      title: 'Modo Personalizado',
      desc: 'Escolha quais seções aparecem na sua página inicial. As mudanças acontecem em tempo real.',
      cta: 'Personalizar',
    },
    {
      id: 'complete' as const,
      icon: Globe,
      title: 'Universo Completo',
      desc: 'Mostra todas as funções, seções e experiências do Oculto como a plataforma completa.',
      cta: 'Ativar Universo Completo',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg sm:text-xl font-bold">Experiência do Oculto</h2>
        <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
          Controle como sua Home aparece. Você pode trocar sempre que quiser.
        </p>
      </div>

      {isLoading && !viewMode ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {cards.map((c) => {
            const active = viewMode === c.id;
            const Icon = c.icon;
            return (
              <Card
                key={c.id}
                className={
                  'relative transition-colors flex flex-col ' +
                  (active ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : 'border-border/60')
                }
              >
                <CardHeader className="pb-2 px-4 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </CardTitle>
                    {active && (
                      <Badge className="gap-1 shrink-0 h-5 px-1.5 text-[10px]">
                        <Check className="h-3 w-3" /> Ativo
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4 flex-1 flex flex-col">
                  <p className="text-xs text-muted-foreground leading-snug sm:min-h-[3.5rem] flex-1">
                    {c.desc}
                  </p>
                  <Button
                    size="sm"
                    variant={active ? 'outline' : 'default'}
                    className="w-full h-10 text-sm touch-manipulation"
                    disabled={busy === c.id}
                    onClick={() => choose(c.id)}
                  >
                    {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : c.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {viewMode === 'custom' && (
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm min-w-0">
              <div className="font-semibold">Modo Personalizado ativo</div>
              <div className="text-muted-foreground text-xs leading-snug">
                Ajuste a qualquer momento quais seções aparecem na Home.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto h-10 shrink-0 touch-manipulation"
              onClick={() => setOpen(true)}
            >
              <Sliders className="h-4 w-4 mr-1" /> Editar seções
            </Button>
          </CardContent>
        </Card>
      )}

      <FeedExperienceModeCard />

      <FeedSyncIndicatorToggleCard />

      <div className="text-[11px] text-muted-foreground border-t pt-3 leading-snug">
        Suas escolhas ficam salvas e sincronizam entre dispositivos. Você pode trocar
        de modo a qualquer momento — as mudanças aparecem em tempo real no feed.
      </div>

      <CustomizeHomeSectionsModal open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * Card de Tipo de Conteúdo do Feed — espelha as duas opções do
 * BetaWelcomeModal. Efeito imediato (otimista + realtime), sem reload.
 */
function FeedExperienceModeCard() {
  const { mode, setMode, isUpdating } = useFeedExperienceMode();

  const options: Array<{
    id: 'adult_only' | 'complete';
    icon: typeof Flame;
    title: string;
    desc: string;
  }> = [
    {
      id: 'adult_only',
      icon: Flame,
      title: 'Apenas conteúdo +18',
      desc: 'Feed restrito a postagens marcadas como +18. Stories, comunidades, salas e Oculto Play ficam ocultos no feed (continuam acessíveis pelo menu).',
    },
    {
      id: 'complete',
      icon: Globe2,
      title: 'Experiência completa',
      desc: 'Mostra tudo: posts, stories, comunidades, salas ocultas, Oculto Play e todo o universo do Oculto.',
    },
  ];

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-transparent to-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Tipo de conteúdo no feed
        </CardTitle>
        <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
          Escolha entre ver apenas conteúdo adulto (+18) ou a experiência completa.
          A mudança tem efeito imediato.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              disabled={isUpdating || active}
              aria-pressed={active}
              className={cn(
                'text-left rounded-xl border-2 p-3 transition-all flex items-start gap-2.5',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
                active
                  ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                  : 'border-border/60 hover:border-amber-500/60 hover:bg-amber-500/5'
              )}
            >
              <div
                className={cn(
                  'shrink-0 h-9 w-9 rounded-lg flex items-center justify-center',
                  active ? 'bg-amber-500 text-black' : 'bg-muted text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold leading-tight">{opt.title}</span>
                  {active && (
                    <Badge className="h-4 px-1 text-[9px] gap-0.5 bg-amber-500 text-black hover:bg-amber-500">
                      <Check className="h-2.5 w-2.5" /> Ativo
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                  {opt.desc}
                </p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * Toggle para ativar/desativar o badge visual de sincronização em
 * tempo real entre dispositivos. Persistido em localStorage.
 */
function FeedSyncIndicatorToggleCard() {
  const { enabled, setEnabled } = useFeedSyncIndicatorPref();
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-start gap-3 p-3 sm:p-4">
        <div className="shrink-0 h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <Label
            htmlFor="feed-sync-indicator-toggle"
            className="text-sm font-semibold leading-tight cursor-pointer"
          >
            Indicador de sincronização em tempo real
          </Label>
          <p className="text-[11px] text-muted-foreground leading-snug mt-1">
            Mostra um pequeno aviso no topo do feed quando o modo é
            atualizado em outro dispositivo. Desative se preferir uma
            navegação 100% silenciosa.
          </p>
        </div>
        <Switch
          id="feed-sync-indicator-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Ativar indicador visual de sincronização em tempo real"
        />
      </CardContent>
    </Card>
  );
}
