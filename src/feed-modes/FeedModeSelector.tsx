import { useState } from 'react';
import { Layers, Check, Lock, Crown, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFeedMode, type FeedModeConfigRow } from './FeedModeProvider';
import { FEED_MODES, type FeedModeId } from './modes.config';
import { cn } from '@/lib/utils';
import { FeedCustomModePanel } from './FeedCustomModePanel';

interface Props {
  className?: string;
  compact?: boolean;
}

const FALLBACK_LABELS: Record<FeedModeId, { label: string; description: string }> = {
  completo:      { label: 'Completo',      description: 'Experiência total: tudo do feed' },
  social:        { label: 'Social',        description: 'Foco em conexões e interações' },
  descoberta:    { label: 'Descoberta',    description: 'Universo, VIPs e novos perfis' },
  limpo:         { label: 'Limpo',         description: 'Só o essencial — feed + stories' },
  card:          { label: 'Card',          description: 'Grade de cards compacta' },
  personalizado: { label: 'Personalizado', description: 'Você escolhe widget a widget' },
};

const FALLBACK_MODES: FeedModeConfigRow[] = (Object.keys(FEED_MODES) as FeedModeId[]).map((id, i) => ({
  mode_id: id,
  label: FALLBACK_LABELS[id].label,
  description: FALLBACK_LABELS[id].description,
  enabled: true,
  min_plan: 'free' as const,
  sort_order: i,
  widgets: null,
}));

export function FeedModeSelector({ className, compact = false }: Props) {
  const { mode, setMode, availableModes, loading, canUseMode, userPlan } = useFeedMode();
  const navigate = useNavigate();
  const [customOpen, setCustomOpen] = useState(false);

  // Fallback: se a tabela admin não carregou ou está vazia, usa a lista local
  // para que o botão SEMPRE apareça (não sumir sob nenhuma condição).
  const modes = availableModes.length > 0 ? availableModes : FALLBACK_MODES;
  if (loading) return null;

  const current = modes.find((m) => m.mode_id === mode) ?? modes[0];

  const handleSelect = async (m: FeedModeId, locked: boolean, minPlan: 'free'|'premium'|'vip') => {
    if (locked) {
      toast.info(
        minPlan === 'vip' ? 'Modo exclusivo VIP' : 'Modo exclusivo Premium',
        {
          description: 'Faça upgrade para liberar este modo de visualização.',
          action: { label: 'Ver planos', onClick: () => navigate('/subscriptions') },
        },
      );
      return;
    }
    const res = await setMode(m);
    if (res.ok && m === 'personalizado') {
      setCustomOpen(true);
      return;
    }
    if (!res.ok && res.reason === 'plan_insufficient') {
      toast.info('Modo bloqueado pelo seu plano', {
        action: { label: 'Ver planos', onClick: () => navigate('/subscriptions') },
      });
    } else if (!res.ok) {
      toast.error('Não foi possível trocar o modo agora.');
    }
  };

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  // Destaque: fundo primary semitransparente + borda + ícone/texto em contraste.
                  'h-9 sm:h-8 min-w-[44px] sm:min-w-0 gap-1.5 px-3 text-xs font-semibold touch-manipulation',
                  'bg-primary/15 text-primary border border-primary/40',
                  'hover:bg-primary/25 hover:text-primary-foreground hover:border-primary',
                  'shadow-[0_0_0_1px_hsl(var(--primary)/0.15)] transition-colors',
                  className,
                )}
                aria-label={`Modo de visualização do feed (atual: ${current?.label ?? 'completo'})`}
              >
                <Layers className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-primary" />
                {!compact && <span className="hidden xs:inline sm:inline">{current?.label ?? 'Modo'}</span>}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px] text-xs leading-snug">
            Troque o modo de visualização do feed (Completo, Social, Descoberta, Limpo, Card).
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-1rem)]">

        <DropdownMenuLabel className="text-xs flex items-center justify-between">
          <span>Modo de visualização</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {userPlan}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {modes.map((m) => {
          const active = m.mode_id === mode;
          const locked = !canUseMode(m.mode_id as FeedModeId);
          return (
            <DropdownMenuItem
              key={m.mode_id}
              onClick={() => handleSelect(m.mode_id as FeedModeId, locked, m.min_plan)}
              className={cn(
                'flex items-start gap-2 py-2',
                locked && 'opacity-80',
              )}
            >
              {locked ? (
                <Lock className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
              ) : (
                <Check
                  className={cn(
                    'h-4 w-4 mt-0.5 shrink-0',
                    active ? 'text-primary' : 'opacity-0',
                  )}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {m.label}
                  {locked && (
                    <span className={cn(
                      'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                      m.min_plan === 'vip'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-primary/15 text-primary',
                    )}>
                      {m.min_plan === 'vip' && <Crown className="h-2.5 w-2.5" />}
                      {m.min_plan}
                    </span>
                  )}
                </div>
                {m.description && (
                  <div className="text-[11px] text-muted-foreground leading-tight">
                    {m.description}
                  </div>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
        {mode === 'personalizado' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCustomOpen(true)} className="gap-2 text-primary">
              <Settings2 className="h-4 w-4" />
              <span className="text-sm font-medium">Ajustar widgets</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
      <FeedCustomModePanel open={customOpen} onOpenChange={setCustomOpen} />
    </DropdownMenu>
  );
}
