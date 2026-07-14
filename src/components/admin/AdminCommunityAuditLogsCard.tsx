/**
 * Painel admin master — Audit logs globais das Comunidades.
 * RPC: community_admin_audit_logs.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Badge } from '@/components/ui/badge';
import { ScrollText } from 'lucide-react';

interface AuditRow {
  id: string;
  community_id: string | null;
  community_title: string | null;
  community_slug: string | null;
  actor_id: string | null;
  actor_name: string | null;
  target_user_id: string | null;
  target_user_name: string | null;
  action: string;
  payload: any;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  member_approve: 'bg-emerald-600/30 text-emerald-200',
  member_reject:  'bg-rose-600/30 text-rose-200',
  member_ban:     'bg-rose-700/40 text-rose-100',
  member_unban:   'bg-emerald-600/30 text-emerald-200',
  topic_remove:   'bg-amber-600/30 text-amber-200',
  reply_remove:   'bg-amber-600/30 text-amber-200',
  community_paused:  'bg-amber-600/30 text-amber-200',
  community_archived:'bg-zinc-600/30 text-zinc-200',
};

export function AdminCommunityAuditLogsCard() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin_oculto_community_audit_logs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('community_admin_audit_logs', { _limit: 100 });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    staleTime: 20_000,
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <ScrollText className="h-4 w-4 text-fuchsia-400" /> Audit logs ({rows.length})
      </h2>
      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">Sem registros.</p>
      )}
      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
        {rows.map((r) => (
          <div key={r.id} className="p-2 rounded-lg border border-border text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`text-[9px] h-4 px-1.5 ${ACTION_COLORS[r.action] ?? 'bg-fuchsia-600/30 text-fuchsia-200'}`}>
                {r.action}
              </Badge>
              {r.community_title && (
                <span className="text-[10px] text-muted-foreground truncate">/{r.community_slug}</span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {new Date(r.created_at).toLocaleString('pt-BR')}
              </span>
            </div>
            <p className="text-[11px] mt-1">
              <span className="font-medium">{r.actor_name ?? 'sistema'}</span>
              {r.target_user_name && <> → {r.target_user_name}</>}
              {r.community_title && <> em <span className="text-fuchsia-300">{r.community_title}</span></>}
            </p>
            {r.payload && Object.keys(r.payload).length > 0 && (
              <pre className="text-[10px] text-muted-foreground mt-1 overflow-x-auto">
                {JSON.stringify(r.payload, null, 0)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
