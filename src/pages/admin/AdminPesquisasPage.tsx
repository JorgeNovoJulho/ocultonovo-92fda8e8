/**
 * AdminPesquisasPage — /admin/pesquisas
 *
 * Disparo retroativo da Pesquisa OCULTO para a base existente.
 *
 * Regras (impostas no servidor via RPC oculto_dispatch_survey_batch):
 *   - NÃO reenvia para quem já respondeu (completed/skipped)
 *   - NÃO reenvia para quem está em andamento (in_progress)
 *   - NÃO reenvia para quem recebeu há menos de N dias (default 7)
 *
 * Filtros: todos | ativos | inativos | premium | vip | criadores
 * Disparo em lote seguro (limite máximo por execução, dry-run obrigatório
 * antes do envio real). Cada execução cria 1 linha em
 * oculto_user_survey_campaigns com contadores completos (log obrigatório).
 */
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, PlayCircle, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import SurveyResultsMetrics from '@/components/admin/SurveyResultsMetrics';

type FilterKey = 'all' | 'active' | 'inactive' | 'premium' | 'vip' | 'creators';

const FILTER_OPTIONS: { value: FilterKey; label: string; hint: string }[] = [
  { value: 'all',      label: 'Todos',     hint: 'Toda a base (exclui seeds)' },
  { value: 'active',   label: 'Ativos',    hint: 'Últimos 30 dias' },
  { value: 'inactive', label: 'Inativos',  hint: 'Mais de 30 dias sem acessar' },
  { value: 'premium',  label: 'Premium',   hint: 'plan_type premium/monthly' },
  { value: 'vip',      label: 'VIP',       hint: 'plan_type vip' },
  { value: 'creators', label: 'Criadores', hint: 'is_creator = true' },
];

type DispatchResult = {
  campaign_id: string;
  dry_run: boolean;
  filter: FilterKey;
  threshold_days: number;
  eligible: number;
  will_dispatch?: number;
  dispatched?: number;
  skipped_completed: number;
  skipped_in_progress: number;
  skipped_recent: number;
};

type CampaignRow = {
  id: string;
  created_at: string;
  finished_at: string | null;
  status: string;
  target_filter: FilterKey;
  dry_run: boolean;
  notify_threshold_days: number;
  total_eligible: number;
  total_sent: number;
  total_skipped_completed: number;
  total_skipped_in_progress: number;
  total_skipped_recent: number;
};

export default function AdminPesquisasPage() {
  const { data: isMaster, isLoading: isLoadingRole } = useIsMasterAdmin();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [threshold, setThreshold] = useState<number>(7);
  const [maxBatch, setMaxBatch] = useState<number>(1000);
  const [running, setRunning] = useState<'preview' | 'dispatch' | null>(null);
  const [lastResult, setLastResult] = useState<DispatchResult | null>(null);

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    const { data, error } = await supabase
      .from('oculto_user_survey_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error) setCampaigns((data ?? []) as CampaignRow[]);
    setLoadingCampaigns(false);
  };

  useEffect(() => { void loadCampaigns(); }, []);

  const runDispatch = async (dryRun: boolean) => {
    if (running) return;
    setRunning(dryRun ? 'preview' : 'dispatch');
    try {
      const { data, error } = await supabase.rpc('oculto_dispatch_survey_batch', {
        p_filter: filter,
        p_dry_run: dryRun,
        p_max: maxBatch,
        p_threshold_days: threshold,
      });
      if (error) throw error;
      const r = data as unknown as DispatchResult;
      setLastResult(r);
      if (dryRun) {
        toast.success(`Pré-visualização: ${r.will_dispatch ?? 0} usuário(s) elegíveis para disparo`);
      } else {
        toast.success(`Disparado para ${r.dispatched ?? 0} usuário(s)`);
      }
      void loadCampaigns();
    } catch (err: any) {
      console.error('[AdminPesquisasPage] dispatch error', err);
      toast.error(err?.message ?? 'Erro ao executar disparo');
    } finally {
      setRunning(null);
    }
  };

  if (isLoadingRole) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!isMaster) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <h2 className="font-semibold text-destructive">Acesso restrito</h2>
            <p className="text-sm text-muted-foreground">
              Apenas o @oculto_master pode disparar pesquisas para a base.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-gradient-to-br from-pink-500/20 to-fuchsia-500/10 p-2 ring-1 ring-pink-400/30">
          <ClipboardList className="h-5 w-5 text-pink-500" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Pesquisas — Disparo retroativo</h1>
          <p className="text-sm text-muted-foreground leading-snug">
            Envie a pesquisa OCULTO para a base existente. Quem já respondeu,
            está em andamento ou recebeu nos últimos {threshold} dias é
            automaticamente ignorado.
          </p>
        </div>
      </header>

      {/* Painel de disparo */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Filtro de público</Label>
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Janela anti-spam (dias)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(1, Math.min(90, Number(e.target.value) || 7)))}
            />
            <p className="text-[10px] text-muted-foreground">Não reenvia para quem já recebeu nessa janela.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tamanho máximo do lote</Label>
            <Input
              type="number"
              min={1}
              max={10000}
              step={100}
              value={maxBatch}
              onChange={(e) => setMaxBatch(Math.max(1, Math.min(10000, Number(e.target.value) || 1000)))}
            />
            <p className="text-[10px] text-muted-foreground">Limite por execução (1–10000).</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => runDispatch(true)}
            disabled={!!running}
            className="gap-2"
          >
            {running === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Pré-visualizar (dry-run)
          </Button>
          <Button
            onClick={() => {
              if (!confirm(`Confirma disparar a pesquisa para o público "${filter}" agora?`)) return;
              void runDispatch(false);
            }}
            disabled={!!running}
            className="gap-2 bg-gradient-to-r from-pink-600 to-fuchsia-600 hover:from-pink-700 hover:to-fuchsia-700"
          >
            {running === 'dispatch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Disparar pesquisa para base existente
          </Button>
        </div>

        {lastResult && (
          <div className={cn(
            'rounded-xl p-3 text-sm space-y-1 border',
            lastResult.dry_run
              ? 'bg-amber-500/5 border-amber-500/30'
              : 'bg-emerald-500/5 border-emerald-500/30',
          )}>
            <div className="font-semibold flex items-center gap-2">
              {lastResult.dry_run ? 'Pré-visualização' : 'Disparo executado'}
              <Badge variant="outline" className="text-[10px]">{lastResult.filter}</Badge>
              <span className="text-[10px] text-muted-foreground font-mono">{lastResult.campaign_id.slice(0,8)}</span>
            </div>
            <ul className="text-xs grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 text-muted-foreground">
              <li>Elegíveis no filtro: <strong className="text-foreground">{lastResult.eligible}</strong></li>
              <li>{lastResult.dry_run ? 'Será disparado' : 'Disparados'}: <strong className="text-foreground">{lastResult.will_dispatch ?? lastResult.dispatched ?? 0}</strong></li>
              <li>Pulados (já responderam): <strong className="text-foreground">{lastResult.skipped_completed}</strong></li>
              <li>Pulados (em andamento): <strong className="text-foreground">{lastResult.skipped_in_progress}</strong></li>
              <li>Pulados (&lt; {lastResult.threshold_days} dias): <strong className="text-foreground">{lastResult.skipped_recent}</strong></li>
            </ul>
          </div>
        )}
      </section>

      {/* Métricas dos resultados das respostas */}
      <SurveyResultsMetrics />

      {/* Histórico de campanhas (log) */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Histórico de disparos
          </h2>
          <Button variant="ghost" size="sm" onClick={() => void loadCampaigns()} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', loadingCampaigns && 'animate-spin')} />
            Atualizar
          </Button>
        </div>

        {loadingCampaigns ? (
          <div className="py-6 grid place-items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum disparo ainda.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Público</th>
                  <th className="px-3 py-2 font-medium">Modo</th>
                  <th className="px-3 py-2 font-medium text-right">Elegíveis</th>
                  <th className="px-3 py-2 font-medium text-right">Disparados</th>
                  <th className="px-3 py-2 font-medium text-right">Pulados</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const skipped = c.total_skipped_completed + c.total_skipped_in_progress + c.total_skipped_recent;
                  return (
                    <tr key={c.id} className="border-t border-border/40 hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px]">{c.target_filter}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {c.dry_run ? (
                          <Badge variant="secondary" className="text-[10px]">preview</Badge>
                        ) : (
                          <Badge className="text-[10px] bg-emerald-600">enviado</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.total_eligible}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{c.total_sent}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title={`completos: ${c.total_skipped_completed} · em andamento: ${c.total_skipped_in_progress} · recentes: ${c.total_skipped_recent}`}>
                        {skipped}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
