import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LogOut, RefreshCcw, Search, Smartphone, Monitor, Tablet } from 'lucide-react';

interface ActiveSessionRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  current_session_id: string;
  device_label: string | null;
  user_agent: string | null;
  updated_at: string;
  created_at: string;
}

function DeviceIcon({ label }: { label: string | null }) {
  const l = (label || '').toLowerCase();
  if (l.includes('mobile')) return <Smartphone className="h-4 w-4" aria-hidden />;
  if (l.includes('tablet')) return <Tablet className="h-4 w-4" aria-hidden />;
  return <Monitor className="h-4 w-4" aria-hidden />;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (Number.isNaN(diff)) return iso;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d} d atrás`;
}

export default function AdminActiveSessionsPage() {
  const [rows, setRows] = useState<ActiveSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<ActiveSessionRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = async (term = search) => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('admin_list_active_sessions', {
        p_search: term || null,
        p_limit: 200,
      });
      if (error) throw error;
      setRows((data || []) as ActiveSessionRow[]);
    } catch (err: any) {
      console.error('[active-sessions] load failed', err);
      toast.error('Falha ao carregar sessões', { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
  }, []);

  const handleRevoke = async () => {
    if (!confirmTarget) return;
    setRevoking(true);
    try {
      const { error } = await (supabase as any).rpc('admin_revoke_active_session', {
        p_user_id: confirmTarget.user_id,
      });
      if (error) throw error;
      toast.success('Sessão encerrada', {
        description: `${confirmTarget.username || confirmTarget.email || 'Usuário'} será deslogado em instantes.`,
      });
      setConfirmTarget(null);
      await load();
    } catch (err: any) {
      toast.error('Falha ao encerrar sessão', { description: err?.message });
    } finally {
      setRevoking(false);
    }
  };

  const total = useMemo(() => rows.length, [rows]);

  return (
    <div className="container max-w-6xl mx-auto py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Sessões Ativas</h1>
        <p className="text-sm text-muted-foreground">
          Visualize as sessões em vigor por usuário e encerre remotamente quando necessário.
          Encerrar a sessão desloga o usuário automaticamente no dispositivo conectado.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-base">
            {loading ? 'Carregando…' : `${total} sessão(ões) ativa(s)`}
          </CardTitle>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') load();
                }}
                placeholder="Buscar por usuário, nome ou e-mail"
                className="pl-8"
              />
            </div>
            <Button variant="outline" onClick={() => load()} disabled={loading} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2">Usuário</th>
                  <th className="px-4 py-2">Dispositivo</th>
                  <th className="px-4 py-2">Atualizada</th>
                  <th className="px-4 py-2">User-Agent</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isRevoked = r.current_session_id.startsWith('REVOKED_BY_ADMIN_');
                  return (
                    <tr key={r.user_id} className="border-t border-border">
                      <td className="px-4 py-2 align-top">
                        <div className="font-medium">{r.display_name || r.username || '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.username ? `@${r.username}` : ''} {r.email ? `· ${r.email}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-top">
                        <div className="flex items-center gap-2">
                          <DeviceIcon label={r.device_label} />
                          <span className="capitalize">{r.device_label || 'desconhecido'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 align-top whitespace-nowrap">
                        {formatRelative(r.updated_at)}
                      </td>
                      <td className="px-4 py-2 align-top max-w-[280px]">
                        <span className="text-xs text-muted-foreground line-clamp-2" title={r.user_agent || ''}>
                          {r.user_agent || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-top text-right">
                        {isRevoked ? (
                          <Badge variant="secondary">Revogada</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-2"
                            onClick={() => setConfirmTarget(r)}
                          >
                            <LogOut className="h-4 w-4" />
                            Encerrar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma sessão ativa encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar sessão deste usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O dispositivo ativo de{' '}
              <strong>
                {confirmTarget?.display_name || confirmTarget?.username || confirmTarget?.email}
              </strong>{' '}
              será deslogado imediatamente e precisará fazer login novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={revoking}>
              {revoking ? 'Encerrando…' : 'Encerrar sessão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
