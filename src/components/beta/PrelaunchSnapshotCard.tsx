/**
 * PrelaunchSnapshotCard — gera e baixa snapshots do estado da plataforma
 * antes de virar para Produção.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Camera, Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

interface Snap {
  id: string;
  label: string;
  note: string | null;
  payload: any;
  created_at: string;
}

export function PrelaunchSnapshotCard() {
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('platform_prelaunch_snapshots')
      .select('id,label,note,payload,created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    setSnaps((data as Snap[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = subscribeTable('platform_prelaunch_snapshots', () => load());
    return () => { unsub(); };
  }, []);

  const take = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_prelaunch_snapshot', {
      p_label: label || `snapshot ${new Date().toLocaleString('pt-BR')}`,
      p_note: note || null,
    });
    setBusy(false);
    if (error) { toast.error('Falha: ' + error.message); return; }
    toast.success('Snapshot gerado ✓');
    setLabel(''); setNote('');
  };

  const download = (s: Snap) => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oculto-snapshot-${s.label.replace(/\s+/g,'_')}-${s.id.slice(0,8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" /> Snapshots de pré-lançamento
        </CardTitle>
        <CardDescription>
          Captura o estado atual (runtime + checklist + auditoria recente). Gere um antes de virar para Produção.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="Rótulo (ex: pre-launch v1)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={take} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
            Gerar snapshot
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : snaps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Nenhum snapshot ainda.</p>
        ) : (
          <ul className="divide-y">
            {snaps.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{s.label}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {new Date(s.created_at).toLocaleString('pt-BR')}
                    </Badge>
                  </div>
                  {s.note && <p className="text-xs text-muted-foreground mt-0.5">{s.note}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => download(s)}>
                  <Download className="h-4 w-4 mr-1" /> JSON
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
