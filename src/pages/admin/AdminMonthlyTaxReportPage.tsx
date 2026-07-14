import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Download, AlertTriangle, Receipt } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { toast } from '@/hooks/use-toast';

const fmt = (n: number) => `R$ ${(Number(n) || 0).toFixed(2)}`;
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export default function AdminMonthlyTaxReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ['monthly-tax', year, month],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_monthly_tax_report' as any, { p_year: year, p_month: month });
      if (error) throw error;
      return data as any;
    },
  });

  const { data: issues = [], isLoading: loadingIssues } = useQuery({
    queryKey: ['tax-audit', year, month],
    queryFn: async () => {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();
      const { data, error } = await supabase.rpc('get_tax_audit_issues' as any, {
        p_start: start, p_end: end, p_limit: 200,
      });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const downloadServerCsv = async () => {
    const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const end = new Date(year, month, 0).toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc('export_tax_report_csv' as any, { p_start: start, p_end: end });
    if (error) { toast({ title: 'Erro ao exportar', description: error.message, variant: 'destructive' }); return; }
    const blob = new Blob([data as string], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fiscal-${year}-${String(month).padStart(2, '0')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Receipt className="h-6 w-6 text-primary" />
        <h1 className="text-2xl md:text-3xl font-bold">Relatório Mensal Fiscal</h1>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label>Ano</Label>
            <select className="w-full h-10 border rounded-md px-2 bg-background" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <Label>Mês</Label>
            <select className="w-full h-10 border rounded-md px-2 bg-background" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <Button variant="outline" onClick={downloadServerCsv}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV (servidor)
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Transações" value={String(data?.tx_count || 0)} loading={isLoading} />
        <Kpi label="Bruto" value={fmt(data?.gross || 0)} loading={isLoading} />
        <Kpi label="Imposto" value={fmt(data?.tax || 0)} loading={isLoading} highlight />
        <Kpi label="Base Tributável" value={fmt(data?.base || 0)} loading={isLoading} />
      </div>

      {/* Gráfico diário: imposto + base + transações */}
      <Card>
        <CardHeader><CardTitle>Movimento diário do mês</CardTitle></CardHeader>
        <CardContent className="h-[320px]">
          {isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.daily || []}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="L" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="R" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any, n: any) => n === 'tx_count' ? v : fmt(Number(v))} />
                <Legend />
                <Bar yAxisId="L" dataKey="base" name="Base" fill="hsl(var(--primary))" />
                <Bar yAxisId="L" dataKey="tax" name="Imposto" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Transações por dia</CardTitle></CardHeader>
        <CardContent className="h-[240px]">
          {isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.daily || []}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="tx_count" name="Transações" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Por fluxo */}
      <Card>
        <CardHeader><CardTitle>Por fluxo</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2">Fluxo</th><th>Tx</th><th className="text-right">Bruto</th><th className="text-right">Imposto</th><th className="text-right">Base</th></tr>
              </thead>
              <tbody>
                {(data?.by_flow || []).map((f: any) => (
                  <tr key={f.flow_type} className="border-b">
                    <td className="py-2">{f.flow_type}</td>
                    <td>{f.tx_count}</td>
                    <td className="text-right">{fmt(f.gross)}</td>
                    <td className="text-right text-destructive">{fmt(f.tax)}</td>
                    <td className="text-right">{fmt(f.base)}</td>
                  </tr>
                ))}
                {!data?.by_flow?.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Sem dados</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Auditoria de divergências */}
      <Card className={issues.length ? 'border-destructive' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Divergências (gross vs base+tax / tax_rate)
            {issues.length > 0 && <Badge variant="destructive">{issues.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingIssues ? <Skeleton className="h-32 w-full" /> : issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma divergência detectada no período. ✅</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Tx ID</th><th>Fluxo</th>
                    <th className="text-right">Bruto</th>
                    <th className="text-right">Tax real</th>
                    <th className="text-right">Tax esperada</th>
                    <th className="text-right">Δ Tax</th>
                    <th className="text-right">Δ Base</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map(i => (
                    <tr key={i.split_log_id} className="border-b">
                      <td className="py-2 font-mono text-xs">{i.transaction_id?.slice(0, 12)}…</td>
                      <td>{i.flow_type}</td>
                      <td className="text-right">{fmt(i.gross_amount)}</td>
                      <td className="text-right">{fmt(i.tax_amount)}</td>
                      <td className="text-right">{fmt(i.expected_tax)}</td>
                      <td className="text-right text-destructive">{fmt(i.tax_diff)}</td>
                      <td className="text-right text-destructive">{fmt(i.base_diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, loading, highlight }: { label: string; value: string; loading?: boolean; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary' : ''}>
      <CardContent className="pt-4 pb-3">
        <div className="text-muted-foreground text-xs">{label}</div>
        {loading ? <Skeleton className="h-7 w-24 mt-2" /> : <div className="text-xl font-bold mt-1">{value}</div>}
      </CardContent>
    </Card>
  );
}
