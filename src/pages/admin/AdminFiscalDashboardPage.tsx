import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, TrendingUp, Receipt, Wallet, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useFinanceOverview, useTaxReport, exportToCSV } from '@/hooks/useFinanceReports';

const fmt = (n: number) => `R$ ${(Number(n) || 0).toFixed(2)}`;

export default function AdminFiscalDashboardPage() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [start, setStart] = useState(monthStart.toISOString().slice(0, 10));
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));

  const startDate = useMemo(() => new Date(start + 'T00:00:00'), [start]);
  const endDate = useMemo(() => new Date(end + 'T23:59:59'), [end]);

  const { data: ov, isLoading } = useFinanceOverview(startDate, endDate);
  const { data: tax = [], isLoading: loadingTax } = useTaxReport(start, end);

  const netProfit = (ov?.platform_total || 0); // já excluído imposto/criador/afiliado

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard Fiscal</h1>
        <p className="text-muted-foreground text-sm">Faturamento, impostos e lucro líquido em tempo real</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label>Início</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>Fim</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => exportToCSV(tax as any[], `relatorio-fiscal-${start}-${end}.csv`)}>
            <Download className="h-4 w-4 mr-2" /> Exportar Fiscal CSV
          </Button>
          <Button variant="outline" onClick={() => exportToCSV((ov?.daily || []) as any[], `financeiro-${start}-${end}.csv`)}>
            <Download className="h-4 w-4 mr-2" /> Exportar Diário CSV
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Faturamento Bruto" value={fmt(ov?.gross_total || 0)} loading={isLoading} />
        <Kpi icon={<Receipt className="h-4 w-4" />} label="Impostos (6%)" value={fmt(ov?.tax_total || 0)} loading={isLoading} />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Lucro Plataforma" value={fmt(netProfit)} loading={isLoading} highlight />
        <Kpi icon={<Users className="h-4 w-4" />} label="Comissões Afiliados" value={fmt(ov?.affiliate_total || 0)} loading={isLoading} />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Repasses Criadores" value={fmt(ov?.creator_total || 0)} loading={isLoading} />
      </div>

      {/* Gráfico diário */}
      <Card>
        <CardHeader><CardTitle>Movimento diário</CardTitle></CardHeader>
        <CardContent className="h-[320px]">
          {isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ov?.daily || []}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
                <Bar dataKey="gross" name="Bruto" fill="hsl(var(--primary))" />
                <Bar dataKey="tax" name="Imposto" fill="hsl(var(--destructive))" />
                <Bar dataKey="platform" name="Plataforma" fill="hsl(var(--accent))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabela fiscal */}
      <Card>
        <CardHeader><CardTitle>Relatório Fiscal por Dia/Fluxo</CardTitle></CardHeader>
        <CardContent>
          {loadingTax ? <Skeleton className="h-40 w-full" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Dia</th><th>Fluxo</th><th>Tx</th>
                    <th className="text-right">Bruto</th>
                    <th className="text-right">Imposto</th>
                    <th className="text-right">Base</th>
                  </tr>
                </thead>
                <tbody>
                  {tax.map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{r.day}</td>
                      <td>{r.flow_type}</td>
                      <td>{r.tx_count}</td>
                      <td className="text-right">{fmt(r.gross)}</td>
                      <td className="text-right text-destructive">{fmt(r.tax)}</td>
                      <td className="text-right">{fmt(r.base)}</td>
                    </tr>
                  ))}
                  {!tax.length && (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem dados no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, loading, highlight }: { icon: React.ReactNode; label: string; value: string; loading?: boolean; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary' : ''}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}{label}</div>
        {loading ? <Skeleton className="h-7 w-24 mt-2" /> : <div className="text-xl font-bold mt-1">{value}</div>}
      </CardContent>
    </Card>
  );
}
