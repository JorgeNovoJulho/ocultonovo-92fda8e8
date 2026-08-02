import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skull, RotateCcw, Eye, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { useImpersonation } from '@/hooks/useImpersonation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CemeteryRow {
  id: string;
  user_id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  plan_type: string | null;
  deleted_at: string | null;
  deleted_reason: string | null;
  created_at: string | null;
}

export default function AdminCemiterioPage() {
  const { data: isMaster, isLoading: roleLoading } = useIsMasterAdmin();
  const { impersonateUser, isLoading: impersonating } = useImpersonation();
  const [rows, setRows] = useState<CemeteryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('vw_account_cemetery')
      .select('*')
      .order('deleted_at', { ascending: false });
    if (error) {
      console.error('[cemiterio] load error', error);
      toast.error('Erro ao carregar cemitério: ' + error.message);
      setRows([]);
    } else {
      setRows((data || []) as CemeteryRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (isMaster) void load(); }, [isMaster, load]);

  const handleRestore = async (row: CemeteryRow) => {
    if (!confirm(`Restaurar conta de @${row.username || row.name}? O usuário poderá logar novamente.`)) return;
    setBusyId(row.user_id);
    const { data, error } = await (supabase as any).rpc('restore_account', { p_user_id: row.user_id });
    
    if (error) { 
      setBusyId(null);
      console.error('[restore_account] error:', error);
      toast.error('Erro ao restaurar: ' + error.message); 
      return; 
    }

    if (data && data.ok === false) {
      setBusyId(null);
      toast.error(data.error || 'A conta não pôde ser restaurada');
      return;
    }

    // REMOÇÃO IMEDIATA E FORÇADA DA UI
    setRows(prev => {
      const updated = prev.filter(r => r.user_id !== row.user_id);
      console.log(`[cemiterio] removendo ${row.username} da UI. Itens restantes:`, updated.length);
      return updated;
    });
    
    setBusyId(null);
    toast.success('Conta restaurada com sucesso');
  };

  const handleAccess = async (row: CemeteryRow) => {
    await impersonateUser({
      id: row.id,
      user_id: row.user_id,
      name: row.name || row.username || 'Conta excluída',
      username: row.username || undefined,
      plan_type: row.plan_type || 'free',
      avatar_url: row.avatar_url || undefined,
    });
  };

  if (roleLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h2 className="text-lg font-bold text-destructive">Acesso restrito</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Apenas o administrador master (@oculto_master) pode acessar o Cemitério de Contas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-200">
            <Skull className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Cemitério de Contas</h1>
            <p className="text-xs text-muted-foreground">
              Contas excluídas pelos próprios usuários — invisíveis na plataforma. Restaurar ou acessar como.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Recarregar'}
        </Button>
      </header>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-10 text-center text-sm text-muted-foreground">
          Nenhuma conta excluída — o cemitério está vazio.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/60 p-4 sm:flex-row sm:items-center"
            >
              <Avatar className="h-12 w-12 ring-2 ring-destructive/40 grayscale">
                <AvatarImage src={row.avatar_url || undefined} alt={row.name || 'Conta excluída'} />
                <AvatarFallback>{(row.name || row.username || '?').slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{row.name || 'Sem nome'}</span>
                  {row.username && <span className="text-xs text-muted-foreground truncate">@{row.username}</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {row.email || '—'} · plano {row.plan_type || 'free'}
                </div>
                <div className="text-[11px] text-destructive">
                  Excluída {row.deleted_at ? format(new Date(row.deleted_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR }) : '—'}
                  {row.deleted_reason ? ` · motivo: ${row.deleted_reason}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => handleAccess(row)}
                  disabled={impersonating}
                >
                  <Eye className="h-3.5 w-3.5" /> Acessar como
                </Button>
                <Button
                  size="sm"
                  className="gap-1 bg-emerald-600 hover:bg-emerald-500"
                  onClick={() => handleRestore(row)}
                  disabled={busyId === row.user_id}
                >
                  {busyId === row.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Restaurar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
