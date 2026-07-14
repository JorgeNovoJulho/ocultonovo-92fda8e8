/**
 * AdminOcultoPlayLaunchCard — Etapa 7
 *
 * Card no Admin Master com checklist pré-lançamento e botão único
 * "Liberar PLAY para todos". Ao confirmar, seta:
 *   enabled = true, visible_to_users = true, beta_open = true
 *
 * Não toca em allowlist nem em outros toggles de seção/gamificação.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Rocket, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayConfig } from '@/hooks/useOcultoPlayAccess';
import { useOcultoPlayAdminStats } from '@/hooks/useOcultoPlayModeration';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface CheckItem {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
}

export function AdminOcultoPlayLaunchCard() {
  const { data: cfg } = useOcultoPlayConfig();
  const { data: stats } = useOcultoPlayAdminStats();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const checks = useMemo<CheckItem[]>(() => {
    const published = Number((stats as any)?.items_published ?? 0);
    return [
      {
        id: 'killswitch',
        label: 'Killswitch global ligado',
        ok: !!cfg?.enabled,
        hint: 'Necessário para o gate liberar acesso fora do Master.',
      },
      {
        id: 'gamification',
        label: 'Gamificação (XP) ativa',
        ok: cfg?.gamification_on !== false,
      },
      {
        id: 'sections',
        label: 'Pelo menos um tipo de mídia ligado',
        ok: !!(cfg?.short_videos_on || cfg?.memes_on || cfg?.audios_on),
      },
      {
        id: 'content',
        label: `Conteúdo mínimo publicado (≥ 10) — atual: ${published}`,
        ok: published >= 10,
        hint: 'Para o feed não nascer vazio. Suba memes/vídeos/áudios pelo botão "Enviar".',
      },
      {
        id: 'pending-reports',
        label: 'Sem denúncias pendentes',
        ok: Number((stats as any)?.reports_pending ?? 0) === 0,
      },
    ];
  }, [cfg, stats]);

  const allOk = checks.every((c) => c.ok);
  const alreadyPublic = !!cfg?.enabled && !!cfg?.visible_to_users && !!cfg?.beta_open;

  const handleLaunch = async () => {
    if (!cfg?.id) return;
    setBusy(true);
    const { error } = await supabase
      .from('oculto_play_config' as never)
      .update({
        enabled: true,
        visible_to_users: true,
        beta_open: true,
      } as never)
      .eq('id', cfg.id);
    setBusy(false);
    if (error) {
      toast.error('Falha ao lançar: ' + error.message);
      return;
    }
    toast.success('OCULTO PLAY liberado para todos os usuários 🚀');
    setOpen(false);
  };

  return (
    <>
      <Card className="border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 via-transparent to-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4 text-fuchsia-400" />
            Lançamento público
            {alreadyPublic && (
              <Badge variant="secondary" className="ml-2 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                no ar
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Checklist mínimo antes de tornar o PLAY visível para todos os usuários logados.
          </p>

          <ul className="space-y-1.5">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  <span className={c.ok ? 'text-foreground' : 'text-muted-foreground'}>{c.label}</span>
                  {!c.ok && c.hint && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{c.hint}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="pt-2 flex justify-end">
            <Button
              onClick={() => setOpen(true)}
              disabled={!allOk || alreadyPublic}
              className="bg-gradient-to-r from-fuchsia-500 to-primary hover:opacity-90"
            >
              <Rocket className="h-4 w-4 mr-2" />
              {alreadyPublic ? 'Já está liberado' : 'Liberar PLAY para todos'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-fuchsia-400" /> Confirmar lançamento
            </DialogTitle>
            <DialogDescription>
              Isso vai ligar <strong>killswitch</strong>, <strong>visível para usuários</strong> e{' '}
              <strong>beta aberto</strong> ao mesmo tempo. O PLAY aparecerá no menu e nas abas do feed para
              todos os usuários logados.
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded p-3">
            Você pode reverter a qualquer momento desligando o killswitch na seção "Acesso global".
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={handleLaunch} disabled={busy} className="bg-gradient-to-r from-fuchsia-500 to-primary">
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              Lançar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AdminOcultoPlayLaunchCard;
