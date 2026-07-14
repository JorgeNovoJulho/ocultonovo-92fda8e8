/**
 * Modal para personalizar quais seções aparecem na Home.
 * Usado em Configurações > Experiência do Oculto.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Info, Sparkles, EyeOff, RotateCcw, Save, X, Lock } from 'lucide-react';
import {
  HOME_SECTIONS,
  ALWAYS_ON_SECTIONS,
  DEFAULT_SIMPLE_SECTIONS,
  DEFAULT_COMPLETE_SECTIONS,
  type HomeSectionConfig,
  type HomeSectionKey,
} from '@/config/homeSections';
import { useViewModePreferences } from '@/hooks/useViewModePreferences';
import { SectionInfoDialog } from './SectionInfoDialog';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function CustomizeHomeSectionsModal({ open, onOpenChange, onSaved }: Props) {
  const { viewMode, customSections, setCustomSections } = useViewModePreferences();
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [infoKey, setInfoKey] = useState<HomeSectionKey | null>(null);

  // Inicializa draft ao abrir
  useEffect(() => {
    if (!open) return;
    const base = Object.keys(customSections).length > 0
      ? customSections
      : (viewMode === 'simple' ? DEFAULT_SIMPLE_SECTIONS : DEFAULT_COMPLETE_SECTIONS);
    const merged: Record<string, boolean> = {};
    HOME_SECTIONS.forEach((s) => {
      merged[s.key] = ALWAYS_ON_SECTIONS.has(s.key) ? true : (base[s.key] ?? false);
    });
    setDraft(merged);
    setInfoKey(null);
  }, [open, viewMode, customSections]);

  const dirty = useMemo(() => {
    return HOME_SECTIONS.some((s) => (customSections[s.key] ?? null) !== draft[s.key]);
  }, [draft, customSections]);

  const handleToggle = (s: HomeSectionConfig, v: boolean) => {
    if (ALWAYS_ON_SECTIONS.has(s.key)) return;
    setDraft((d) => ({ ...d, [s.key]: v }));
  };

  const handleAllOn = () => {
    const next: Record<string, boolean> = {};
    HOME_SECTIONS.forEach((s) => { next[s.key] = true; });
    setDraft(next);
  };
  const handleAllOff = () => {
    const next: Record<string, boolean> = {};
    HOME_SECTIONS.forEach((s) => { next[s.key] = ALWAYS_ON_SECTIONS.has(s.key); });
    setDraft(next);
  };
  const handleResetDefault = () => {
    const next: Record<string, boolean> = {};
    HOME_SECTIONS.forEach((s) => { next[s.key] = s.defaultSimple || ALWAYS_ON_SECTIONS.has(s.key); });
    setDraft(next);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await setCustomSections(draft);
      toast.success('Preferências da Home atualizadas');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar agora.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100vw-0.75rem)] sm:w-full max-w-[96vw] sm:max-w-2xl
          max-h-[92dvh] sm:max-h-[90vh] p-0 rounded-2xl overflow-hidden
          flex flex-col gap-0
        "
      >
        <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b text-left shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-8">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            Personalizar Página Inicial
          </DialogTitle>
          <DialogDescription className="text-[12px] sm:text-sm">
            Escolha quais seções aparecem na sua Home. As mudanças entram em tempo real.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 px-4 sm:px-5 py-2.5 border-b bg-muted/20 shrink-0">
          <Button size="sm" variant="outline" className="h-9 px-3 text-xs" onClick={handleAllOn}>Ativar tudo</Button>
          <Button size="sm" variant="outline" className="h-9 px-3 text-xs" onClick={handleAllOff}>
            <EyeOff className="h-3.5 w-3.5 mr-1" /> Ocultar tudo
          </Button>
          <Button size="sm" variant="outline" className="h-9 px-3 text-xs" onClick={handleResetDefault}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar padrão
          </Button>
        </div>

        <div
          className="
            flex-1 min-h-0 overflow-y-auto overscroll-contain
            [scrollbar-width:none] [-ms-overflow-style:none]
            [&::-webkit-scrollbar]:hidden
          "
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="px-4 sm:px-5 py-3 space-y-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {HOME_SECTIONS.map((s) => {
              const checked = !!draft[s.key];
              const locked = ALWAYS_ON_SECTIONS.has(s.key);
              return (
                <div
                  key={s.key}
                  className={cn(
                    'rounded-lg border border-border/60 bg-card/40 p-3 transition-colors',
                    checked ? 'border-primary/30' : 'opacity-90',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{s.label}</span>
                        {locked && (
                          <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5">
                            <Lock className="h-2.5 w-2.5" /> sempre ativo
                          </Badge>
                        )}
                        {s.heavy && (
                          <Badge variant="outline" className="h-4 px-1 text-[9px] border-amber-400/40 text-amber-400">
                            pesada
                          </Badge>
                        )}
                        {s.hiddenSessions && (
                          <Badge variant="outline" className="h-4 px-1 text-[9px] border-primary/40 text-primary">
                            Sessões Ocultas
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {s.description}
                      </div>
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 mt-1 min-h-[28px] touch-manipulation"
                        onClick={() => setInfoKey(s.key)}
                      >
                        <Info className="h-3 w-3" />
                        Saiba mais
                      </button>
                    </div>
                    {/* Switch com área de toque ampliada no mobile */}
                    <label className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -m-2 p-2 touch-manipulation">
                      <Switch
                        checked={checked}
                        disabled={locked}
                        onCheckedChange={(v) => handleToggle(s, v)}
                        aria-label={`Ativar ${s.label}`}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            <div className="h-2" />
          </div>
        </div>

        <SectionInfoDialog
          section={infoKey ? HOME_SECTIONS.find((x) => x.key === infoKey) ?? null : null}
          open={!!infoKey}
          onOpenChange={(o) => !o && setInfoKey(null)}
        />

        <DialogFooter
          className="
            shrink-0 px-4 sm:px-5 py-2.5 sm:py-3 border-t bg-background/95 backdrop-blur
            flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2
            pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))]
          "
        >
          <Button variant="ghost" className="w-full sm:w-auto h-10" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button className="w-full sm:w-auto h-10" onClick={handleSave} disabled={saving || !dirty}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
