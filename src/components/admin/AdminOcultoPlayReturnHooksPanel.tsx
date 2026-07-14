/**
 * AdminOcultoPlayReturnHooksPanel — Volte para Ver (PROMPT 3 — Etapa 12)
 * Lista ganchos personalizados pendentes/vistos por usuário.
 */
import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Hook = {
  id: string;
  user_id: string;
  hook_type: string;
  title: string;
  description: string | null;
  status: 'pending' | 'seen' | 'completed' | 'dismissed' | 'expired';
  priority: number;
  created_at: string;
};

export function AdminOcultoPlayReturnHooksPanel() {
  const [items, setItems] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'all' | Hook['status']>('all');

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('oculto_return_hooks' as never)
      .select('id, user_id, hook_type, title, description, status, priority, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Hook[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const remove = async (id: string) => {
    if (!confirm('Remover este gancho?')) return;
    const { error } = await supabase.from('oculto_return_hooks' as never).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    toast.success('Removido');
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="seen">Vistos</SelectItem>
            <SelectItem value="completed">Concluídos</SelectItem>
            <SelectItem value="dismissed">Descartados</SelectItem>
            <SelectItem value="expired">Expirados</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Recarregar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum gancho encontrado.</p>
      ) : items.map(h => (
        <Card key={h.id}>
          <CardContent className="p-3 flex gap-3 items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{h.hook_type}</Badge>
                <Badge variant={h.status === 'pending' ? 'default' : 'secondary'} className="text-[10px]">{h.status}</Badge>
                {h.priority > 0 && <Badge className="text-[10px]">prio {h.priority}</Badge>}
              </div>
              <p className="text-sm font-medium truncate mt-1">{h.title}</p>
              {h.description && <p className="text-xs text-muted-foreground line-clamp-1">{h.description}</p>}
              <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">user {h.user_id}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove(h.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
