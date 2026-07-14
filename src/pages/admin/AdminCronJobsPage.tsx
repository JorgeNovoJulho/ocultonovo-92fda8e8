import { useMemo } from 'react';
import { useOcultoCronJobs, useRunCronNow } from '@/hooks/useOcultoCronJobs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Play, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function describeSchedule(cron: string): string {
  const map: Record<string, string> = {
    '0 3 * * *':  'Diário às 03:00 UTC (00:00 BRT)',
    '0 4 * * *':  'Diário às 04:00 UTC (01:00 BRT)',
    '0 * * * *':  'A cada hora cheia',
    '*/5 * * * *':'A cada 5 minutos',
    '* * * * *':  'A cada minuto',
  };
  return map[cron] || cron;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">Nunca executado</Badge>;
  if (status === 'succeeded') return (
    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
      <CheckCircle2 className="w-3 h-3 mr-1" /> Sucesso
    </Badge>
  );
  if (status === 'failed') return (
    <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
      <XCircle className="w-3 h-3 mr-1" /> Falhou
    </Badge>
  );
  return (
    <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20">
      <AlertCircle className="w-3 h-3 mr-1" /> {status}
    </Badge>
  );
}

export default function AdminCronJobsPage() {
  const { data: jobs, isLoading, refetch, isFetching } = useOcultoCronJobs();
  const runMutation = useRunCronNow();

  const sorted = useMemo(() => (jobs || []).slice().sort((a, b) => a.jobname.localeCompare(b.jobname)), [jobs]);

  const handleRun = async (jobname: string) => {
    toast.loading(`Executando ${jobname}…`, { id: jobname });
    try {
      const res = await runMutation.mutateAsync(jobname);
      if (res.ok) {
        toast.success(`${jobname} OK (${res.duration_ms}ms)`, { id: jobname });
      } else {
        toast.error(`${jobname} falhou: ${res.error}`, { id: jobname });
      }
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'desconhecido'}`, { id: jobname });
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cron Jobs (pg_cron)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tarefas automatizadas do Postgres — prefixo <code className="text-xs bg-muted px-1 rounded">oculto-*</code>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum cron job <code>oculto-*</code> instalado.
            <br />
            <span className="text-xs">
              Aplique <code>2026_05_14_cron_jobs.sql</code> no SQL Editor do Supabase externo.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {sorted.map((j) => (
          <Card key={j.jobid}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base font-mono break-all">{j.jobname}</CardTitle>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{describeSchedule(j.schedule)}</span>
                    <span className="opacity-50">·</span>
                    <code>{j.schedule}</code>
                    {!j.active && <Badge variant="outline" className="ml-2">Inativo</Badge>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleRun(j.jobname)}
                  disabled={runMutation.isPending}
                >
                  <Play className="w-3.5 h-3.5 mr-1.5" /> Rodar agora
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {j.command}
              </pre>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground mb-1">Status</div>
                  <StatusBadge status={j.last_status} />
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Última execução</div>
                  <div>
                    {j.last_run_start
                      ? formatDistanceToNow(new Date(j.last_run_start), { addSuffix: true, locale: ptBR })
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Retorno</div>
                  <div className="truncate" title={j.last_return_msg || ''}>
                    {j.last_return_msg || '—'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
