/**
 * AuditHistoryCard — últimas mudanças em platform_runtime_settings.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, History } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

interface AuditRow {
  id: string;
  changed_by: string | null;
  prev_mode: string | null;
  new_mode: string | null;
  prev_snapshot: any;
  new_snapshot: any;
  created_at: string;
}

const BOOL_KEYS = [
  'beta_enabled','beta_free_has_premium_social','beta_founders_enabled',
  'monetization_enabled','subscriptions_enabled','vip_channels_enabled',
  'paid_content_enabled','payouts_enabled','safe_meetings_enabled',
  'whatsapp_enabled','real_experiences_enabled','launch_checklist_required',
];

function diffSummary(prev: any, next: any): string[] {
  if (!prev || !next) return [];
  const out: string[] = [];
  if (prev.platform_mode !== next.platform_mode) {
    out.push(`mode: ${prev.platform_mode} → ${next.platform_mode}`);
  }
  for (const k of BOOL_KEYS) {
    if (prev[k] !== next[k]) out.push(`${k}: ${prev[k] ? 'on' : 'off'} → ${next[k] ? 'on' : 'off'}`);
  }
  if (prev.beta_welcome_title !== next.beta_welcome_title) out.push('título de boas-vindas alterado');
  if (prev.beta_welcome_message !== next.beta_welcome_message) out.push('mensagem de boas-vindas alterada');
  return out;
}

export function AuditHistoryCard() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('platform_runtime_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(15);
    setRows((data as AuditRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = subscribeTable('platform_runtime_audit', () => load(), { events: ['INSERT'] });
    return () => { unsub(); };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" /> Histórico de alterações
        </CardTitle>
        <CardDescription>Últimas 15 mudanças aplicadas no painel.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nenhuma alteração registrada ainda.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const diffs = diffSummary(r.prev_snapshot, r.new_snapshot);
              return (
                <li key={r.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {new Date(r.created_at).toLocaleString('pt-BR')}
                    </Badge>
                    {r.prev_mode !== r.new_mode && (
                      <Badge variant="secondary" className="text-[10px]">
                        {r.prev_mode} → {r.new_mode}
                      </Badge>
                    )}
                  </div>
                  {diffs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem diferenças significativas.</p>
                  ) : (
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      {diffs.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
