/**
 * LaunchChecklistCard — checklist persistente no banco.
 * Quando todos os itens "required" estão done, o preset de PRODUÇÃO é liberado.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { toast } from 'sonner';

interface Item {
  key: string;
  label: string;
  description: string | null;
  required: boolean;
  done: boolean;
  done_at: string | null;
  sort_order: number;
}

export function LaunchChecklistCard({ onReadyChange }: { onReadyChange?: (ready: boolean) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from('platform_launch_checklist')
      .select('key,label,description,required,done,done_at,sort_order')
      .order('sort_order', { ascending: true });
    if (!error && data) setItems(data as Item[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = subscribeTable('platform_launch_checklist', () => load());
    return () => { unsub(); };
  }, []);

  const requiredPending = items.filter((i) => i.required && !i.done).length;
  const ready = requiredPending === 0 && items.length > 0;
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);

  const toggle = async (it: Item, v: boolean) => {
    setBusy(it.key);
    const { error } = await supabase
      .from('platform_launch_checklist')
      .update({ done: v, done_at: v ? new Date().toISOString() : null })
      .eq('key', it.key);
    setBusy(null);
    if (error) { toast.error('Falha ao atualizar: ' + error.message); return; }
    setItems((arr) => arr.map((x) => x.key === it.key ? { ...x, done: v, done_at: v ? new Date().toISOString() : null } : x));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span>Checklist de pré-lançamento</span>
          {ready
            ? <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Pronto</Badge>
            : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {requiredPending} pendente(s)</Badge>}
        </CardTitle>
        <CardDescription>
          Todos os itens obrigatórios devem estar concluídos antes de aplicar o preset de Produção.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.key} className="flex items-start gap-3 py-3">
                <Checkbox
                  id={`chk-${it.key}`}
                  checked={it.done}
                  disabled={busy === it.key}
                  onCheckedChange={(v) => toggle(it, Boolean(v))}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <label htmlFor={`chk-${it.key}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    {it.label}
                    {it.required
                      ? <Badge variant="outline" className="text-[10px] py-0">obrigatório</Badge>
                      : <Badge variant="secondary" className="text-[10px] py-0">opcional</Badge>}
                  </label>
                  {it.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{it.description}</p>
                  )}
                  {it.done && it.done_at && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      ✓ Concluído em {new Date(it.done_at).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
