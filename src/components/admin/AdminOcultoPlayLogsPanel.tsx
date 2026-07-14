/**
 * AdminOcultoPlayLogsPanel — Logs (PROMPT 3 — Etapa 14)
 * Lê audit_logs globais filtrando por target_resource LIKE 'oculto_play%'
 * ou action_type contendo 'play'. Schema real: admin_id, action_type,
 * target_resource, target_id, details.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Log = {
  id: string;
  admin_id: string | null;
  action_type: string;
  target_resource: string | null;
  target_id: string | null;
  created_at: string;
  details?: Record<string, unknown> | null;
};

export function AdminOcultoPlayLogsPanel() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_logs' as never)
      .select('id, admin_id, action_type, target_resource, target_id, created_at, details')
      .or('target_resource.ilike.%oculto_play%,action_type.ilike.%play%')
      .order('created_at', { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setLogs((data ?? []) as Log[]);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Recarregar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nenhum log encontrado. Logs aparecerão aqui conforme ações forem registradas.
        </p>
      ) : logs.map(l => (
        <Card key={l.id}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{l.action_type}</Badge>
              {l.target_resource && <Badge variant="secondary" className="text-[10px]">{l.target_resource}</Badge>}
              <span className="text-[10px] text-muted-foreground ml-auto">{new Date(l.created_at).toLocaleString('pt-BR')}</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-1 truncate">
              admin: {l.admin_id ?? '—'} · target: {l.target_id ?? '—'}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
