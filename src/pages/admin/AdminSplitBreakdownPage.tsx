/**
 * AdminSplitBreakdownPage
 * - Mostra o breakdown 20/6/5/69 (lido de split_config) aplicado às últimas transações reais (Supabase).
 * - Mostra telemetria recente das edge functions (split_config vs fallback_constants).
 * - Valida que cada linha soma 100% do bruto.
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle2, Calculator, Database, FileWarning, BellRing } from 'lucide-react';
import { useSplitConfig } from '@/hooks/useSplitConfig';
import { supabase } from '@/lib/supabaseExternal';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Tipo das transações usadas na auditoria de breakdown (vêm do Supabase externo).
interface BreakdownTx {
  id: string;
  label: string;
  gross: number;
  hasAffiliate: boolean;
}

interface Breakdown {
  gross: number; tax: number; base: number;
  platform: number; affiliate: number; creator: number; sum: number;
}

function calcBreakdown(gross: number, cfg: { platform: number; tax: number; creator: number; affiliate: number }, hasAffiliate: boolean): Breakdown {
  const tax = +(gross * cfg.tax / 100).toFixed(2);
  const base = +(gross - tax).toFixed(2);
  const platform = +(base * cfg.platform / 100).toFixed(2);
  const affiliate = hasAffiliate ? +(base * cfg.affiliate / 100).toFixed(2) : 0;
  const creator = +(base - platform - affiliate).toFixed(2);
  const sum = +(tax + platform + affiliate + creator).toFixed(2);
  return { gross, tax, base, platform, affiliate, creator, sum };
}

interface TelemetryRow {
  source: string;
  resolved_from: string;
  total_calls: number;
  last_seen: string;
  avg_platform: number;
  avg_tax: number;
  avg_creator: number;
  avg_affiliate: number;
}

export default function AdminSplitBreakdownPage() {
  const { data: active, isLoading } = useSplitConfig();

  const cfg = useMemo(() => ({
    platform: Number(active?.platform_percent ?? 20),
    tax:      Number(active?.tax_percent ?? 6),
    creator:  Number(active?.creator_percent ?? 69),
    affiliate:Number(active?.affiliate_percent ?? 5),
  }), [active]);

  const cfgSum = +(cfg.platform + cfg.tax + cfg.creator + cfg.affiliate).toFixed(2);
  const cfgValid = cfgSum === 100;

  // Últimas transações reais concluídas (Supabase externo) usadas na auditoria
  const realTxs = useQuery({
    queryKey: ['split-breakdown-real-txs'],
    queryFn: async (): Promise<BreakdownTx[]> => {
      const { data, error } = await supabase
        .from('transactions' as any)
        .select('id, amount, type, category, description, affiliate_id, created_at, status')
        .eq('status', 'completed')
        .gt('amount', 0)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) {
        console.warn('[Oculto] split-breakdown real txs failed:', error.message);
        return [];
      }
      return ((data as any[]) ?? []).map((tx) => ({
        id: String(tx.id).slice(0, 8),
        label: tx.description || tx.category || tx.type || 'Transação',
        gross: Number(tx.amount) || 0,
        hasAffiliate: !!tx.affiliate_id,
      }));
    },
    refetchInterval: 60_000,
  });

  const breakdowns = useMemo(
    () => (realTxs.data ?? []).map((tx) => ({ tx, br: calcBreakdown(tx.gross, cfg, tx.hasAffiliate) })),
    [realTxs.data, cfg],
  );

  const telemetry = useQuery({
    queryKey: ['split-telemetry-summary'],
    queryFn: async (): Promise<TelemetryRow[]> => {
      const { data, error } = await supabase.rpc('get_split_telemetry_summary' as any, { p_days: 7 });
      if (error) throw error;
      return (data ?? []) as TelemetryRow[];
    },
    refetchInterval: 30_000,
  });

  const recent = useQuery({
    queryKey: ['split-telemetry-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('split_telemetry_logs' as any)
        .select('id, source, resolved_from, platform_pct, tax_pct, creator_pct, affiliate_pct, sum_pct, error_msg, created_at')
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    refetchInterval: 30_000,
  });

  // Resumo de fallback (últimas 24h) — alimenta o card de alerta
  const fallback = useQuery({
    queryKey: ['split-fallback-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_split_fallback_summary' as any)
        .select('*');
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    refetchInterval: 30_000,
  });

  const qc = useQueryClient();
  const { toast } = useToast();
  const resolveAlerts = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('resolve_split_fallback_alerts' as any);
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast({ title: 'Alertas resolvidos', description: `${count ?? 0} alerta(s) marcado(s) como lido(s).` });
      qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Calculator className="w-7 h-7" /> Split Breakdown — Auditoria
        </h1>
        <p className="text-muted-foreground mt-1">
          Demonstra como o split <strong>{cfg.platform}/{cfg.tax}/{cfg.affiliate}/{cfg.creator}</strong> (Plataforma/Imposto/Afiliado/Criador) é aplicado em transações de exemplo,
          usando os percentuais ativos em <code>split_config</code>.
        </p>
      </div>

      {/* Status da config ativa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" /> Configuração Ativa</CardTitle>
          <CardDescription>Lida em tempo real de <code>public.split_config</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-16" /> : (
            <div className={`flex flex-wrap items-center gap-3 p-3 rounded-lg border ${cfgValid ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-destructive/40 bg-destructive/10'}`}>
              {cfgValid
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                : <AlertTriangle className="w-5 h-5 text-destructive" />}
              <span className="font-medium">Plataforma {cfg.platform}% · Imposto {cfg.tax}% · Afiliado {cfg.affiliate}% · Criador {cfg.creator}%</span>
              <Badge variant={cfgValid ? 'default' : 'destructive'}>Soma: {cfgSum}%</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alerta de Fallback de Split */}
      <Card className={(fallback.data?.length ?? 0) > 0 ? 'border-destructive/50 bg-destructive/5' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className={`w-5 h-5 ${(fallback.data?.length ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            Alerta: Split usando configuração fallback
          </CardTitle>
          <CardDescription>
            Quando uma edge function não consegue ler <code>split_config</code>, ela usa constantes fallback (20/6/69/5).
            Toda ocorrência cria um alerta para o Admin Master (cooldown de 60 min por origem).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fallback.isLoading ? (
            <Skeleton className="h-16" />
          ) : (fallback.data?.length ?? 0) === 0 ? (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" /> Nenhum uso de fallback nas últimas 24h.
            </div>
          ) : (
            <div className="space-y-2">
              {(fallback.data ?? []).map((row: any) => (
                <div
                  key={row.source}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded border border-destructive/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="destructive">{row.source}</Badge>
                    <span className="text-sm">
                      <strong>{row.calls_24h}</strong> chamadas em 24h
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    último: {format(new Date(row.last_seen), "dd/MM HH:mm", { locale: ptBR })}
                    {row.last_error && <span className="ml-2 text-destructive">· {row.last_error}</span>}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 mt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Verifique <code>split_config</code> (is_active=true) e os logs da edge function listada acima.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolveAlerts.mutate()}
                  disabled={resolveAlerts.isPending}
                >
                  Marcar alertas como resolvidos
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela de breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Breakdown por Transação (últimas reais)</CardTitle>
          <CardDescription>
            Últimas até 10 transações concluídas em <code>public.transactions</code>. A coluna <strong>Σ</strong> deve sempre bater com o <strong>Bruto</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {realTxs.isLoading ? (
            <Skeleton className="h-24" />
          ) : (realTxs.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nenhuma transação concluída encontrada ainda. Assim que houver pagamentos reais (PIX/cartão), a auditoria popula automaticamente.
            </p>
          ) : (
          <>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left p-2">Transação</th>
                <th className="text-right p-2">Bruto</th>
                <th className="text-right p-2 text-amber-500">Imposto</th>
                <th className="text-right p-2 text-primary">Plataforma</th>
                <th className="text-right p-2 text-violet-500">Afiliado</th>
                <th className="text-right p-2 text-emerald-500">Criador</th>
                <th className="text-right p-2">Σ</th>
                <th className="p-2 text-center">Check</th>
              </tr>
            </thead>
            <tbody>
              {breakdowns.map(({ tx, br }) => {
                const ok = Math.abs(br.sum - br.gross) < 0.02;
                return (
                  <tr key={tx.id} className="border-b last:border-0">
                    <td className="p-2">
                      <div className="font-medium">{tx.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {tx.id} {tx.hasAffiliate && <span className="text-violet-500">• com afiliado</span>}
                      </div>
                    </td>
                    <td className="text-right p-2 font-medium">R$ {br.gross.toFixed(2)}</td>
                    <td className="text-right p-2 text-amber-500">R$ {br.tax.toFixed(2)}</td>
                    <td className="text-right p-2 text-primary">R$ {br.platform.toFixed(2)}</td>
                    <td className="text-right p-2 text-violet-500">R$ {br.affiliate.toFixed(2)}</td>
                    <td className="text-right p-2 text-emerald-500 font-medium">R$ {br.creator.toFixed(2)}</td>
                    <td className="text-right p-2">R$ {br.sum.toFixed(2)}</td>
                    <td className="text-center p-2">
                      {ok
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                        : <AlertTriangle className="w-4 h-4 text-destructive inline" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-3">
            Fórmula: <code>imposto = bruto × {cfg.tax}%</code> · <code>base = bruto − imposto</code> · <code>plataforma = base × {cfg.platform}%</code> · <code>afiliado = base × {cfg.affiliate}%</code> (se aplicável) · <code>criador = base − plataforma − afiliado</code>.
          </p>
          </>
          )}
        </CardContent>
      </Card>

      {/* Telemetria das edge functions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileWarning className="w-5 h-5" /> Telemetria de Split (últimos 7 dias)</CardTitle>
          <CardDescription>
            Toda chamada às edge functions financeiras registra qual fonte foi usada. <strong>fallback_constants</strong> indica que <code>split_config</code> estava indisponível.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {telemetry.isLoading ? <Skeleton className="h-24" /> : (
            <div className="space-y-2">
              {(telemetry.data ?? []).map((r) => (
                <div key={`${r.source}-${r.resolved_from}`} className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded border ${r.resolved_from === 'fallback_constants' ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={r.resolved_from === 'fallback_constants' ? 'destructive' : 'default'}>
                      {r.resolved_from}
                    </Badge>
                    <span className="font-medium">{r.source}</span>
                    <span className="text-xs text-muted-foreground">
                      P {r.avg_platform}% · I {r.avg_tax}% · A {r.avg_affiliate}% · C {r.avg_creator}%
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {r.total_calls} chamadas · última {format(new Date(r.last_seen), "dd/MM HH:mm", { locale: ptBR })}
                  </div>
                </div>
              ))}
              {!telemetry.data?.length && (
                <p className="text-sm text-muted-foreground">Nenhuma telemetria registrada ainda. Execute uma cobrança PIX/cartão para popular.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Eventos recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Eventos recentes</CardTitle>
          <CardDescription>Últimos 15 registros individuais.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {recent.isLoading ? <Skeleton className="h-24" /> : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-left p-2">Quando</th>
                  <th className="text-left p-2">Source</th>
                  <th className="text-left p-2">Fonte</th>
                  <th className="text-right p-2">P/I/A/C</th>
                  <th className="text-right p-2">Σ</th>
                  <th className="text-left p-2">Erro</th>
                </tr>
              </thead>
              <tbody>
                {(recent.data ?? []).map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-2 whitespace-nowrap">{format(new Date(r.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}</td>
                    <td className="p-2">{r.source}</td>
                    <td className="p-2">
                      <Badge variant={r.resolved_from === 'fallback_constants' ? 'destructive' : 'outline'} className="text-xs">
                        {r.resolved_from}
                      </Badge>
                    </td>
                    <td className="text-right p-2">{r.platform_pct}/{r.tax_pct}/{r.affiliate_pct}/{r.creator_pct}</td>
                    <td className={`text-right p-2 ${Number(r.sum_pct) === 100 ? '' : 'text-destructive font-medium'}`}>{r.sum_pct}%</td>
                    <td className="p-2 text-destructive truncate max-w-[200px]">{r.error_msg ?? '—'}</td>
                  </tr>
                ))}
                {!recent.data?.length && (
                  <tr><td colSpan={6} className="p-3 text-muted-foreground text-center">Sem eventos ainda.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
