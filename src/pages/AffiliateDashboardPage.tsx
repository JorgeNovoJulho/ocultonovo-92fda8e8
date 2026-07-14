import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Wallet, Users, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAffiliateEarnings, exportToCSV } from '@/hooks/useFinanceReports';
import { useAffiliateEarningsBreakdown } from '@/hooks/useAffiliateEarningsBreakdown';

const fmt = (n: number) => `R$ ${(Number(n) || 0).toFixed(2)}`;

export default function AffiliateDashboardPage() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [start, setStart] = useState(monthStart.toISOString().slice(0, 10));
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));

  const startDate = useMemo(() => new Date(start + 'T00:00:00'), [start]);
  const endDate = useMemo(() => new Date(end + 'T23:59:59'), [end]);

  const { data, isLoading } = useAffiliateEarnings(startDate, endDate);
  const { data: breakdown, isLoading: breakdownLoading } = useAffiliateEarningsBreakdown(startDate, endDate);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Painel do Afiliado</h1>
        <p className="text-muted-foreground text-sm">Seus ganhos por indicação no período</p>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div><Label>Início</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>Fim</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Button variant="outline" onClick={() => exportToCSV((data?.recent || []) as any[], `afiliado-${start}-${end}.csv`)}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Total Ganho" value={fmt(data?.total_earned || 0)} loading={isLoading} highlight />
        <Kpi icon={<Users className="h-4 w-4" />} label="Transações" value={String(data?.tx_count || 0)} loading={isLoading} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Volume Indicado" value={fmt(data?.gross_referred || 0)} loading={isLoading} />
      </div>

      <Card>
        <CardHeader><CardTitle>Ganhos diários</CardTitle></CardHeader>
        <CardContent className="h-[280px]">
          {isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.daily || []}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Bar dataKey="earned" name="Comissão" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico recente</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr><th className="py-2">Data</th><th>Tipo</th><th className="text-right">Bruto</th><th className="text-right">Sua comissão</th></tr>
                </thead>
                <tbody>
                  {(data?.recent || []).map(r => (
                    <tr key={r.id} className="border-b">
                      <td className="py-2">{new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
                      <td>{r.flow_type}</td>
                      <td className="text-right">{fmt(r.gross_amount)}</td>
                      <td className="text-right text-primary font-semibold">{fmt(r.affiliate_amount)}</td>
                    </tr>
                  ))}
                  {!data?.recent?.length && (
                    <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sem comissões no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Ganhos por transação (origem)</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportToCSV((breakdown || []) as any[], `afiliado-tx-${start}-${end}.csv`)}
            disabled={!breakdown?.length}
          >
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {breakdownLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Data</th>
                    <th>Origem</th>
                    <th className="font-mono text-xs">External ID</th>
                    <th className="text-right">Bruto</th>
                    <th className="text-right">Sua comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {(breakdown || []).map(r => (
                    <tr key={r.transaction_external_id} className="border-b border-border/40">
                      <td className="py-2 whitespace-nowrap">{new Date(r.processed_at).toLocaleDateString('pt-BR')}</td>
                      <td className="text-muted-foreground">{r.origin}</td>
                      <td className="font-mono text-[11px] truncate max-w-[180px]" title={r.transaction_external_id}>{r.transaction_external_id}</td>
                      <td className="text-right">{fmt(r.total_amount)}</td>
                      <td className="text-right text-primary font-semibold">{fmt(r.affiliate_amount)}</td>
                    </tr>
                  ))}
                  {!breakdown?.length && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Sem comissões agrupadas no período</td></tr>
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
