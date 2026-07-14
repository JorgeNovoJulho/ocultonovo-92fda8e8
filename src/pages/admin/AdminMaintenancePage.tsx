/**
 * AdminMaintenancePage — controle do Modo Manutenção (Admin Master apenas).
 * Usa RPCs set_maintenance / force_logout_all / get_maintenance_state no
 * Supabase EXTERNO. Lê auditoria de oculto_maintenance_audit.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useMaintenanceState } from '@/hooks/useMaintenanceGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { LogOut, Wrench, RefreshCw, ShieldCheck } from 'lucide-react';

interface AuditRow {
  id: string;
  action: string;
  actor_user_id: string | null;
  meta: any;
  created_at: string;
}

export default function AdminMaintenancePage() {
  const qc = useQueryClient();
  const { state } = useMaintenanceState();
  const [message, setMessage] = useState(state.message);

  const audit = useQuery<AuditRow[]>({
    queryKey: ['maintenance-audit'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('oculto_maintenance_audit')
        .select('id, action, actor_user_id, meta, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async (enable: boolean) => {
      const { data, error } = await (supabase as any)
        .rpc('set_maintenance', { p_enabled: enable, p_message: message || null });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, enable) => {
      toast.success(enable ? 'Manutenção ativada.' : 'Site reaberto ao público.');
      qc.invalidateQueries({ queryKey: ['maintenance-state'] });
      qc.invalidateQueries({ queryKey: ['maintenance-audit'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao alterar manutenção'),
  });

  const forceLogout = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('force_logout_all');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Logout geral disparado.');
      qc.invalidateQueries({ queryKey: ['maintenance-state'] });
      qc.invalidateQueries({ queryKey: ['maintenance-audit'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha no logout geral'),
  });

  const saveMessage = useMutation({
    mutationFn: async () => {
      // Apenas atualiza a mensagem sem alterar o enabled
      const { data, error } = await (supabase as any)
        .rpc('set_maintenance', { p_enabled: state.enabled, p_message: message });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Mensagem atualizada.');
      qc.invalidateQueries({ queryKey: ['maintenance-state'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao salvar mensagem'),
  });

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="h-6 w-6 text-primary" /> Modo Manutenção
        </h1>
        <p className="text-sm text-muted-foreground">
          Bloqueia o acesso ao site para todos os usuários, exceto o Admin Master
          (<code className="font-mono">{state.allowed_admin_username}</code>).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Status atual
            <span className={`text-xs font-bold px-2 py-1 rounded ${state.enabled ? 'bg-destructive/15 text-destructive' : 'bg-emerald-500/15 text-emerald-600'}`}>
              {state.enabled ? 'EM MANUTENÇÃO' : 'NO AR'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-muted-foreground text-xs">Iniciada em</div><div>{state.started_at ? new Date(state.started_at).toLocaleString('pt-BR') : '—'}</div></div>
            <div><div className="text-muted-foreground text-xs">Finalizada em</div><div>{state.finished_at ? new Date(state.finished_at).toLocaleString('pt-BR') : '—'}</div></div>
            <div><div className="text-muted-foreground text-xs">Versão de logout</div><div className="font-mono">{state.force_logout_version}</div></div>
            <div><div className="text-muted-foreground text-xs">Permitido</div><div className="font-mono">{state.allowed_admin_username}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Mensagem exibida ao público</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} />
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => saveMessage.mutate()} disabled={saveMessage.isPending}>
              Salvar mensagem
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ações</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3 p-3 rounded border border-border">
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={state.enabled} disabled />
              <span>{state.enabled ? 'Manutenção ativa' : 'Site aberto'}</span>
            </div>
            {state.enabled ? (
              <Button size="sm" variant="outline" onClick={() => toggle.mutate(false)} disabled={toggle.isPending}>
                <ShieldCheck className="h-4 w-4 mr-1" /> Reabrir site
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive"><Wrench className="h-4 w-4 mr-1" /> Ativar manutenção</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Ativar Modo Manutenção?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso desconectará usuários ativos e exibirá aviso de manutenção para o público.
                      Apenas o Admin Master <strong>{state.allowed_admin_username}</strong> continuará acessando o sistema.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => toggle.mutate(true)}>Ativar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="w-full">
                <LogOut className="h-4 w-4 mr-1" /> Forçar logout geral
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Forçar logout de todos os usuários?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos os usuários (exceto o Admin Master) serão desconectados na próxima sincronização.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => forceLogout.mutate()}>Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Histórico de auditoria
            <Button size="sm" variant="ghost" onClick={() => audit.refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {audit.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (audit.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Sem registros ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {audit.data!.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
                  <div>
                    <div className="font-medium">{row.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <code className="text-[10px] text-muted-foreground truncate max-w-[40%]">
                    {row.actor_user_id?.slice(0, 8) ?? '—'}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
