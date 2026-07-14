import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const PAGE_SIZE = 20;

interface AuditEntry {
  id: string;
  admin_id: string;
  action_type: string;
  target_resource: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function SecurityAuditPanel() {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['security-audit-logs', page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await (supabase as any)
        .from('audit_logs')
        .select('id, admin_id, action_type, target_resource, details, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { logs: (data || []) as AuditEntry[], total: count || 0 };
    },
    staleTime: 30_000,
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const getBadgeVariant = (action: string) => {
    if (action === 'UNAUTHORIZED_ADMIN_ACCESS') return 'destructive';
    if (action.includes('ban') || action.includes('removed')) return 'destructive';
    return 'secondary';
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-destructive" />
          Segurança — Log de Auditoria
          <Badge variant="outline" className="ml-auto text-xs">
            {total} registros
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhum log de auditoria registrado.
          </p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between gap-3 py-2 border-b border-border/30 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getBadgeVariant(log.action_type)} className="text-xs">
                      {log.action_type}
                    </Badge>
                    {log.target_resource && (
                      <span className="text-xs text-muted-foreground truncate">
                        {log.target_resource}
                      </span>
                    )}
                  </div>
                  {log.details && (log.details as any).email && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {(log.details as any).email}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(log.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-border/30">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
