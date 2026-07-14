import { useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target:
    | { type: 'module'; moduleCode: string; moduleName: string; sessionId?: string }
    | { type: 'card'; cardId: string; cardPreview: string; moduleCode?: string; sessionId?: string };
}

const REASONS = [
  'Conteúdo ofensivo ou agressivo',
  'Conteúdo sexualmente inadequado',
  'Discriminação / discurso de ódio',
  'Spam ou propaganda',
  'Outro motivo',
];

export function SocialBetaReportDialog({ open, onOpenChange, target }: Props) {
  const [reason, setReason] = useState(REASONS[0]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const fullReason = extra.trim() ? `${reason} — ${extra.trim()}` : reason;
    setBusy(true);
    try {
      const payload: any = {
        _target_type: target.type,
        _reason: fullReason,
        _session_id: (target as any).sessionId ?? null,
      };
      if (target.type === 'module') {
        payload._module_code = target.moduleCode;
      } else {
        payload._card_id = target.cardId;
        payload._module_code = target.moduleCode ?? null;
      }
      const { error } = await (supabase as any).rpc('social_beta_report_content', payload);
      if (error) throw error;
      toast.success('Denúncia enviada. Obrigado por sinalizar.');
      onOpenChange(false);
      setExtra('');
      setReason(REASONS[0]);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('rate_limited')) {
        toast.error('Limite de denúncias atingido. Tente em uma hora.');
      } else {
        toast.error('Não foi possível enviar a denúncia.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Denunciar {target.type === 'module' ? 'módulo' : 'card'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
            {target.type === 'module' ? (
              <>Módulo: <strong>{target.moduleName}</strong></>
            ) : (
              <>Card: <em className="line-clamp-2">{target.cardPreview}</em></>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Motivo</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Detalhes (opcional)</label>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value.slice(0, 300))}
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              placeholder="Conte o que aconteceu..."
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border px-3 py-1.5 text-sm"
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-50"
          >
            {busy ? 'Enviando…' : 'Enviar denúncia'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SocialBetaReportDialog;
