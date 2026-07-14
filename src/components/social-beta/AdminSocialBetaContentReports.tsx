import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Loader2, RefreshCw, Flag, Check, Archive, Ban, RotateCcw, FileText, Layers } from 'lucide-react';
import { toast } from 'sonner';

type ContentReport = {
  id: string;
  target_type: 'module' | 'card';
  module_code: string | null;
  module_label: string | null;
  card_id: string | null;
  card_content: string | null;
  card_level: string | null;
  session_id: string | null;
  reporter_id: string;
  reporter_username: string | null;
  reason: string;
  status: 'open' | 'resolved' | 'archived';
  reports_count_for_target: number;
  created_at: string;
  resolved_at: string | null;
};

type Filter = 'open' | 'resolved' | 'archived' | 'all';

export function AdminSocialBetaContentReports() {
  const [rows, setRows] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('social_beta_list_content_reports', {
      _status: filter,
      _limit: 100,
    });
    if (error) {
      toast.error('Erro ao carregar denúncias');
      setRows([]);
    } else {
      setRows((data || []) as ContentReport[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const resolve = async (id: string, action: 'resolved' | 'archived' | 'open') => {
    setBusyId(id);
    const { error } = await (supabase as any).rpc('social_beta_resolve_content_report', {
      _report_id: id,
      _action: action,
    });
    setBusyId(null);
    if (error) { toast.error('Falha ao atualizar'); return; }
    toast.success(action === 'open' ? 'Reaberta' : action === 'archived' ? 'Arquivada' : 'Resolvida');
    load();
  };

  const disableTarget = async (r: ContentReport) => {
    if (!confirm(
      r.target_type === 'module'
        ? `Desativar o módulo "${r.module_label}"? Ele sairá do ar para todos os usuários.`
        : `Desativar este card? Ele não será mais sorteado.`,
    )) return;
    setBusyId(r.id);
    const { error } = await (supabase as any).rpc('social_beta_disable_target', {
      _target_type: r.target_type,
      _module_code: r.module_code,
      _card_id: r.card_id,
      _note: 'Desativado via painel de denúncias',
    });
    setBusyId(null);
    if (error) { toast.error('Falha ao desativar'); return; }
    toast.success(r.target_type === 'module' ? 'Módulo desativado' : 'Card desativado');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold">Denúncias de Conteúdo (Módulos & Cards)</h2>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
        >
          <RefreshCw className="h-3 w-3" /> Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['open', 'resolved', 'archived', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md border px-2.5 py-1 text-xs capitalize ${
              filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {f === 'open' ? 'abertas' : f === 'resolved' ? 'resolvidas' : f === 'archived' ? 'arquivadas' : 'todas'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma denúncia {filter === 'all' ? '' : `(${filter})`}.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {r.target_type === 'module' ? <Layers className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                    <span>{r.target_type === 'module' ? 'Módulo' : 'Card'}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5">{r.module_label || r.module_code || '—'}</span>
                    {r.card_level && (
                      <span className="rounded bg-muted px-1.5 py-0.5 capitalize">{r.card_level}</span>
                    )}
                    {r.reports_count_for_target > 1 && (
                      <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">
                        {r.reports_count_for_target}× denunciado
                      </span>
                    )}
                  </div>

                  {r.target_type === 'card' && r.card_content && (
                    <p className="rounded-md border border-border bg-muted/40 p-2 text-xs italic line-clamp-3">
                      "{r.card_content}"
                    </p>
                  )}

                  <p className="text-sm">{r.reason}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Por @{r.reporter_username || '???'} · {new Date(r.created_at).toLocaleString('pt-BR')}
                    {r.status !== 'open' && <span className="ml-2 rounded bg-muted px-1.5 py-0.5">{r.status}</span>}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                {r.status === 'open' ? (
                  <>
                    <button
                      onClick={() => resolve(r.id, 'resolved')}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Check className="h-3 w-3" /> Resolver
                    </button>
                    <button
                      onClick={() => resolve(r.id, 'archived')}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Archive className="h-3 w-3" /> Arquivar
                    </button>
                    <button
                      onClick={() => disableTarget(r)}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground hover:opacity-90"
                    >
                      <Ban className="h-3 w-3" />
                      Desativar {r.target_type === 'module' ? 'módulo' : 'card'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => resolve(r.id, 'open')}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    <RotateCcw className="h-3 w-3" /> Reabrir
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AdminSocialBetaContentReports;
