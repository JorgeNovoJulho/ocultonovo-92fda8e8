import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Loader2, RefreshCw, Flag, Check, Archive, Ban, RotateCcw } from 'lucide-react';

type Report = {
  id: string;
  session_id: string;
  session_title: string | null;
  slot: string | null;
  host_id: string | null;
  host_username: string | null;
  reporter_id: string;
  reporter_username: string | null;
  target_user: string | null;
  target_username: string | null;
  reason: string;
  status: 'open' | 'resolved' | 'archived';
  created_at: string;
  resolved_at: string | null;
};

type Filter = 'open' | 'resolved' | 'archived' | 'all';

export function AdminSocialBetaReports() {
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).rpc('social_beta_list_reports', {
      _limit: 100,
      _status: filter,
    });
    setRows((data || []) as Report[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const resolve = async (id: string, action: 'resolved' | 'archived' | 'open') => {
    setBusyId(id);
    await (supabase as any).rpc('social_beta_resolve_report', {
      _report_id: id, _action: action, _note: null,
    });
    setBusyId(null);
    await load();
  };

  const banHost = async (r: Report) => {
    if (!r.host_id) return;
    const ok = window.confirm(
      `Banir host @${r.host_username || r.host_id.slice(0, 8)} e encerrar a sessão "${r.session_title || ''}"?`
    );
    if (!ok) return;
    setBusyId(r.id);
    try {
      const { error } = await (supabase as any).rpc('social_beta_ban_host', {
        _session_id: r.session_id,
        _reason: `Denúncia ${r.id}`,
      });
      if (error) alert(error.message);
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'open', label: 'Abertas' },
    { key: 'resolved', label: 'Resolvidas' },
    { key: 'archived', label: 'Arquivadas' },
    { key: 'all', label: 'Todas' },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-destructive" />
          <h2 className="font-semibold">Denúncias do Módulo Social Beta</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 ${filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma denúncia nesse filtro.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const busy = busyId === r.id;
            return (
              <article key={r.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <span>{r.session_title || 'Sessão removida'}</span>
                      <span className="text-xs text-muted-foreground">· {r.slot || '—'}</span>
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        r.status === 'open' ? 'bg-destructive/15 text-destructive'
                        : r.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-muted text-muted-foreground'
                      }`}>{r.status}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Host <span className="font-mono">@{r.host_username || (r.host_id ? r.host_id.slice(0, 8) : '—')}</span>
                      {' · '}reportado por <span className="font-mono">@{r.reporter_username || r.reporter_id.slice(0, 8)}</span>
                      {r.target_username && (<> · alvo <span className="font-mono">@{r.target_username}</span></>)}
                    </p>
                    <p className="mt-2 text-sm whitespace-pre-wrap break-words">{r.reason}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.status !== 'resolved' && (
                    <button
                      disabled={busy}
                      onClick={() => resolve(r.id, 'resolved')}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 px-2.5 py-1 text-xs hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> Resolver
                    </button>
                  )}
                  {r.status !== 'archived' && (
                    <button
                      disabled={busy}
                      onClick={() => resolve(r.id, 'archived')}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      <Archive className="h-3 w-3" /> Arquivar
                    </button>
                  )}
                  {r.status !== 'open' && (
                    <button
                      disabled={busy}
                      onClick={() => resolve(r.id, 'open')}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" /> Reabrir
                    </button>
                  )}
                  {r.host_id && (
                    <button
                      disabled={busy}
                      onClick={() => banHost(r)}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-2.5 py-1 text-xs hover:bg-destructive/20 disabled:opacity-50"
                    >
                      <Ban className="h-3 w-3" /> Banir host
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
