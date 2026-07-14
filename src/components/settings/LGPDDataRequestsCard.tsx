/**
 * LGPDDataRequestsCard — Onda 3 LGPD
 * Permite ao usuário solicitar exportação real (.zip) e exclusão da conta,
 * listando as solicitações anteriores com status e link assinado quando pronto.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Download, Trash2, FileArchive, Loader2, ShieldCheck, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface LGPDRequest {
  id: string;
  kind: 'export' | 'erasure' | 'rectification' | 'restriction' | 'portability';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  signed_url: string | null;
  expires_at: string | null;
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
}

const STATUS_LABEL: Record<LGPDRequest['status'], string> = {
  pending: 'Pendente',
  processing: 'Processando',
  completed: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

const STATUS_VARIANT: Record<LGPDRequest['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  processing: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
};

export function LGPDDataRequestsCard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<LGPDRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [erasing, setErasing] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('lgpd_data_requests' as never)
      .select('*')
      .order('requested_at', { ascending: false })
      .limit(20);
    if (!error && Array.isArray(data)) setRequests(data as unknown as LGPDRequest[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      // 1) Cria a solicitação via RPC (com rate-limit)
      const { data: rpcData, error: rpcErr } = await (supabase as any)
        .rpc('lgpd_request_export');
      if (rpcErr) throw rpcErr;
      const requestId = rpcData?.request_id;
      if (!requestId) throw new Error('request_id ausente');

      toast.loading('Preparando seu arquivo .zip...', { id: 'lgpd-export' });

      // 2) Dispara a edge function que monta o ZIP e devolve a signed URL
      const { data, error } = await supabase.functions.invoke('lgpd-export-zip', {
        body: { request_id: requestId },
      });
      if (error) throw error;

      toast.success('Exportação concluída', { id: 'lgpd-export' });

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener');
      }
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao exportar';
      toast.error(msg, { id: 'lgpd-export' });
    } finally {
      setExporting(false);
    }
  };

  const handleErasure = async () => {
    if (!user) return;
    setErasing(true);
    try {
      const { error: rpcErr } = await (supabase as any)
        .rpc('lgpd_request_erasure', { p_reason: 'Solicitado via Configurações > Privacidade' });
      if (rpcErr) throw rpcErr;

      toast.loading('Anonimizando seus dados...', { id: 'lgpd-erase' });

      let ok = false;
      try {
        const { error } = await supabase.functions.invoke('delete-account');
        if (!error) ok = true;
      } catch { /* fallback abaixo */ }
      if (!ok) {
        const { error: rpcSoftErr } = await (supabase as any).rpc('soft_delete_account', {
          p_user_id: user.id,
          p_reason: 'lgpd_erasure',
        });
        if (rpcSoftErr) throw rpcSoftErr;
      }

      toast.success('Sua conta foi removida. Você será desconectado.', { id: 'lgpd-erase' });
      setTimeout(() => {
        supabase.auth.signOut().finally(() => { window.location.href = '/'; });
      }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao excluir conta';
      toast.error(msg, { id: 'lgpd-erase' });
      setErasing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Seus direitos LGPD
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Conforme a Lei nº 13.709/2018 (LGPD), você pode <strong>exportar</strong> ou
          <strong> excluir</strong> seus dados pessoais a qualquer momento. Registros
          fiscais e antifraude são mantidos por 5 anos por exigência legal.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar meus dados (.zip)
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={erasing} className="gap-2">
                {erasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir minha conta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar exclusão da conta</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação é <strong>irreversível</strong>. Seu perfil, mensagens, mídias e
                  conteúdos sociais serão removidos ou anonimizados. Registros fiscais e de
                  antifraude serão mantidos por 5 anos por exigência legal.
                  <br /><br />
                  Recomendamos exportar seus dados antes de prosseguir.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleErasure} className="bg-destructive hover:bg-destructive/90">
                  Sim, excluir minha conta
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Histórico de solicitações
          </h4>
          {loading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : requests.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma solicitação ainda.</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between p-2 rounded-md border border-border/50 text-sm">
                  <div className="flex items-center gap-2">
                    <FileArchive className="h-4 w-4 text-muted-foreground" />
                    <span className="capitalize">{r.kind === 'export' ? 'Exportação' : r.kind === 'erasure' ? 'Exclusão' : r.kind}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.requested_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    {r.status === 'completed' && r.signed_url && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1"
                              onClick={() => window.open(r.signed_url!, '_blank', 'noopener')}>
                        <Download className="h-3 w-3" /> Baixar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
