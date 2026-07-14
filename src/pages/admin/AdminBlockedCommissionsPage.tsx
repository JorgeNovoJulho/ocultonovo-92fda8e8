import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, RefreshCw, ShieldOff, ShieldCheck, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

interface BlockedCommission {
  id: string;
  referrer_id: string | null;
  referred_id: string | null;
  subscription_id: string | null;
  gross_amount: number | null;
  reason: string;
  evidence: Record<string, unknown> | null;
  review_status: 'pending' | 'suspicious' | 'cleared';
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const STATUS_COLOR: Record<string, "default" | "destructive" | "secondary"> = {
  pending: "secondary", suspicious: "destructive", cleared: "default",
};

export default function AdminBlockedCommissionsPage() {
  const [items, setItems] = useState<BlockedCommission[]>([]);
  const [filters, setFilters] = useState({ status: "", reason: "", ip: "", days: 30 });
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState<BlockedCommission | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_blocked_commissions', {
        p_status: filters.status || null,
        p_reason: filters.reason || null,
        p_ip: filters.ip || null,
        p_days: filters.days,
        p_limit: 500,
      });
      if (error) throw error;
      setItems((data as BlockedCommission[]) || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ipCounts = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((b) => {
      const ip = (b.evidence as { shared_ip?: string } | null)?.shared_ip;
      if (ip) map.set(ip, (map.get(ip) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [items]);

  const deviceCounts = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((b) => {
      const d = (b.evidence as { shared_device?: string } | null)?.shared_device;
      if (d) map.set(d, (map.get(d) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [items]);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fraud-blocked-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const headers = ['id','referrer_id','referred_id','subscription_id','gross_amount','reason','review_status','shared_ip','shared_device','created_at'];
    const rows = items.map((b) => {
      const ev = (b.evidence ?? {}) as { shared_ip?: string; shared_device?: string };
      return [b.id, b.referrer_id, b.referred_id, b.subscription_id, b.gross_amount,
              b.reason, b.review_status, ev.shared_ip, ev.shared_device, b.created_at]
        .map((v) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fraud-blocked-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const review = async (status: 'suspicious' | 'cleared') => {
    if (!reviewing) return;
    try {
      const { data, error } = await supabase.rpc('update_commission_review', {
        p_block_id: reviewing.id, p_status: status, p_note: reviewNote || null,
      });
      if (error) throw error;
      const r = data as { success?: boolean };
      if (!r?.success) throw new Error('Falha ao atualizar');
      toast.success(status === 'suspicious' ? 'Marcado como suspeito' : 'Marcado como liberado');
      setReviewing(null); setReviewNote("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao revisar");
    }
  };

  return (
    <div className="container max-w-7xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldOff className="text-destructive" />
          <h1 className="text-2xl font-bold">Comissões Bloqueadas</h1>
          <Badge variant="outline">{items.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <FileSpreadsheet className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportJSON}>
            <FileJson className="w-4 h-4 mr-1" /> JSON
          </Button>
          <Button size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </header>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="bg-background border rounded px-2 py-2 text-sm"
          >
            <option value="">Todos status</option>
            <option value="pending">Pendente</option>
            <option value="suspicious">Suspeitos</option>
            <option value="cleared">Liberados</option>
          </select>
          <Input placeholder="Motivo (ex: shared_ip)" value={filters.reason}
                 onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value }))} />
          <Input placeholder="IP" value={filters.ip}
                 onChange={(e) => setFilters((f) => ({ ...f, ip: e.target.value }))} />
          <select
            value={filters.days}
            onChange={(e) => setFilters((f) => ({ ...f, days: Number(e.target.value) }))}
            className="bg-background border rounded px-2 py-2 text-sm"
          >
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <Button onClick={load}>Filtrar</Button>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-2 text-sm">Top IPs em bloqueios</h3>
          <ul className="text-sm space-y-1">
            {ipCounts.map(([ip, count]) => (
              <li key={ip} className="flex justify-between">
                <span className="font-mono">{ip}</span>
                <Badge variant="destructive">{count}</Badge>
              </li>
            ))}
            {ipCounts.length === 0 && <li className="opacity-60">—</li>}
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-2 text-sm">Top Devices em bloqueios</h3>
          <ul className="text-sm space-y-1">
            {deviceCounts.map(([d, count]) => (
              <li key={d} className="flex justify-between">
                <span className="font-mono truncate max-w-[220px]">{d}</span>
                <Badge variant="destructive">{count}</Badge>
              </li>
            ))}
            {deviceCounts.length === 0 && <li className="opacity-60">—</li>}
          </ul>
        </Card>
      </div>

      <Card className="p-0 overflow-auto max-h-[60vh]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b">
            <tr>
              <th className="text-left p-2">Quando</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Motivo</th>
              <th className="text-left p-2">Referrer</th>
              <th className="text-left p-2">Referido</th>
              <th className="text-left p-2">Valor</th>
              <th className="text-left p-2">IP / Device</th>
              <th className="text-left p-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => {
              const ev = (b.evidence ?? {}) as { shared_ip?: string; shared_device?: string };
              return (
                <tr key={b.id} className="border-b hover:bg-muted/30">
                  <td className="p-2 whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="p-2"><Badge variant={STATUS_COLOR[b.review_status]}>{b.review_status}</Badge></td>
                  <td className="p-2">{b.reason}</td>
                  <td className="p-2 font-mono">{b.referrer_id?.slice(0, 8)}</td>
                  <td className="p-2 font-mono">{b.referred_id?.slice(0, 8)}</td>
                  <td className="p-2">R$ {Number(b.gross_amount ?? 0).toFixed(2)}</td>
                  <td className="p-2 font-mono text-[10px]">
                    {ev.shared_ip && <div>{ev.shared_ip}</div>}
                    {ev.shared_device && <div className="opacity-70 truncate max-w-[140px]">{ev.shared_device}</div>}
                  </td>
                  <td className="p-2">
                    <Button size="sm" variant="outline" onClick={() => { setReviewing(b); setReviewNote(b.review_note || ""); }}>
                      Revisar
                    </Button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center opacity-60">Nenhuma comissão bloqueada no período.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisar comissão bloqueada</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-3 text-sm">
              <div><strong>Motivo:</strong> {reviewing.reason}</div>
              <div><strong>Valor:</strong> R$ {Number(reviewing.gross_amount ?? 0).toFixed(2)}</div>
              <div><strong>Evidência:</strong>
                <pre className="bg-muted p-2 rounded text-[10px] overflow-auto max-h-40">
                  {JSON.stringify(reviewing.evidence, null, 2)}
                </pre>
              </div>
              <Textarea placeholder="Nota da revisão (motivo da decisão)…"
                        value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="destructive" onClick={() => review('suspicious')}>
              <ShieldOff className="w-4 h-4 mr-1" /> Marcar suspeito
            </Button>
            <Button variant="default" onClick={() => review('cleared')}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Liberar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
