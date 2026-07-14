/**
 * AdminRetentionPage — painel master da Retenção Inicial Inteligente.
 * Tabs: Missões | Alertas | Ciclos Sociais | Founder Beta.
 * CRUD direto nas tabelas oculto_retention_*.
 */
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';

function useTable<T extends Record<string, any>>(table: string, orderBy = 'sort_order') {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-retention', table],
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await (supabase as any).from(table).select('*').order(orderBy, { ascending: true });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
  const save = useMutation({
    mutationFn: async (row: T) => {
      const { error } = await (supabase as any).from(table).upsert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Salvo');
      qc.invalidateQueries({ queryKey: ['admin-retention', table] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar'),
  });
  return { ...q, save: save.mutateAsync, saving: save.isPending };
}

function RowEditor<T extends Record<string, any>>({
  row, fields, onSave, saving,
}: { row: T; fields: Array<{ key: keyof T; label: string; type?: 'text'|'number'|'bool' }>; onSave: (r: T) => void; saving: boolean }) {
  const [local, setLocal] = useState<T>(row);
  return (
    <Card className="border-white/10 bg-white/[0.02]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-white/90">{String((local as any).key ?? (local as any).id ?? 'Item')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {fields.map(f => {
          const value = (local as any)[f.key];
          if (f.type === 'bool') {
            return (
              <div key={String(f.key)} className="flex items-center justify-between">
                <Label className="text-xs">{f.label}</Label>
                <Switch checked={!!value} onCheckedChange={(v) => setLocal({ ...local, [f.key]: v } as T)} />
              </div>
            );
          }
          return (
            <div key={String(f.key)} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <Input
                type={f.type === 'number' ? 'number' : 'text'}
                value={value ?? ''}
                onChange={(e) => setLocal({ ...local, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value } as T)}
              />
            </div>
          );
        })}
        <Button size="sm" disabled={saving} onClick={() => onSave(local)}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminRetentionPage() {
  const missions = useTable<any>('oculto_retention_missions_config');
  const alerts = useTable<any>('oculto_retention_alerts_config', 'key');
  const cycles = useTable<any>('oculto_social_cycles_config');

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Retenção Inicial Inteligente</h1>
        <p className="text-sm text-muted-foreground">Missões, alertas, ciclos sociais e Founder Beta. Backend externo.</p>
      </div>

      <Tabs defaultValue="missions">
        <TabsList>
          <TabsTrigger value="missions">Missões</TabsTrigger>
          <TabsTrigger value="alerts">Alertas de retorno</TabsTrigger>
          <TabsTrigger value="cycles">Ciclos sociais</TabsTrigger>
        </TabsList>

        <TabsContent value="missions" className="grid gap-3 md:grid-cols-2">
          {(missions.data ?? []).map(r => (
            <RowEditor key={r.key} row={r} saving={missions.saving} onSave={missions.save}
              fields={[
                { key: 'title', label: 'Título' },
                { key: 'body', label: 'Descrição' },
                { key: 'cta_label', label: 'CTA label' },
                { key: 'cta_route', label: 'CTA route' },
                { key: 'reward', label: 'Recompensa' },
                { key: 'min_day', label: 'Min dia', type: 'number' },
                { key: 'max_day', label: 'Max dia', type: 'number' },
                { key: 'sort_order', label: 'Ordem', type: 'number' },
                { key: 'active', label: 'Ativo', type: 'bool' },
              ]} />
          ))}
        </TabsContent>

        <TabsContent value="alerts" className="grid gap-3 md:grid-cols-2">
          {(alerts.data ?? []).map(r => (
            <RowEditor key={r.key} row={r} saving={alerts.saving} onSave={alerts.save}
              fields={[
                { key: 'title', label: 'Título' },
                { key: 'body', label: 'Mensagem' },
                { key: 'emoji', label: 'Emoji' },
                { key: 'hour_start', label: 'Hora início', type: 'number' },
                { key: 'hour_end', label: 'Hora fim', type: 'number' },
                { key: 'max_per_day', label: 'Máx/dia', type: 'number' },
                { key: 'active', label: 'Ativo', type: 'bool' },
              ]} />
          ))}
        </TabsContent>

        <TabsContent value="cycles" className="grid gap-3 md:grid-cols-2">
          {(cycles.data ?? []).map(r => (
            <RowEditor key={r.key} row={r} saving={cycles.saving} onSave={cycles.save}
              fields={[
                { key: 'label', label: 'Nome' },
                { key: 'emoji', label: 'Emoji' },
                { key: 'message', label: 'Mensagem' },
                { key: 'hour_start', label: 'Hora início', type: 'number' },
                { key: 'hour_end', label: 'Hora fim', type: 'number' },
                { key: 'intensity', label: 'Intensidade (low|medium|high|rare)' },
                { key: 'hue', label: 'Hue', type: 'number' },
                { key: 'sort_order', label: 'Ordem', type: 'number' },
                { key: 'active', label: 'Ativo', type: 'bool' },
              ]} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
