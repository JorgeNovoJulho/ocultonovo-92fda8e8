/**
 * PlanLimitsManagerCard — admin CRUD para plan_permissions e usage_limits.
 * Banco-alvo: Supabase EXTERNO. RLS já restringe write a admins.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

type Plan = 'free' | 'premium' | 'vip';

type Permission = { id: string; plan: Plan; feature: string; enabled: boolean; description: string | null };
type Limit = { id: string; plan: Plan; feature: string; limit_value: number; period_seconds: number; description: string | null };

const PLANS: Plan[] = ['free', 'premium', 'vip'];

export function PlanLimitsManagerCard() {
  const [tab, setTab] = useState<Plan>('free');
  const [perms, setPerms] = useState<Permission[]>([]);
  const [limits, setLimits] = useState<Limit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: l }] = await Promise.all([
      (supabase as any).from('plan_permissions').select('*').order('feature'),
      (supabase as any).from('usage_limits').select('*').order('feature'),
    ]);
    setPerms((p ?? []) as Permission[]);
    setLimits((l ?? []) as Limit[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const permsByPlan = useMemo(() => perms.filter(p => p.plan === tab), [perms, tab]);
  const limitsByPlan = useMemo(() => limits.filter(l => l.plan === tab), [limits, tab]);

  const togglePerm = async (row: Permission, enabled: boolean) => {
    setSaving(`p-${row.id}`);
    setPerms(prev => prev.map(x => x.id === row.id ? { ...x, enabled } : x));
    const { error } = await (supabase as any).from('plan_permissions').update({ enabled }).eq('id', row.id);
    setSaving(null);
    if (error) {
      setPerms(prev => prev.map(x => x.id === row.id ? { ...x, enabled: !enabled } : x));
      toast.error('Falha ao salvar permissão');
    } else {
      toast.success('Permissão atualizada');
    }
  };

  const updateLimit = async (row: Limit, patch: Partial<Limit>) => {
    setSaving(`l-${row.id}`);
    const merged = { ...row, ...patch };
    setLimits(prev => prev.map(x => x.id === row.id ? merged : x));
    const { error } = await (supabase as any).from('usage_limits').update({
      limit_value: merged.limit_value,
      period_seconds: merged.period_seconds,
    }).eq('id', row.id);
    setSaving(null);
    if (error) {
      toast.error('Falha ao salvar limite');
      void load();
    } else {
      toast.success('Limite atualizado');
    }
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Planos: Permissões & Limites
        </CardTitle>
        <CardDescription>
          Edite o que cada plano (Free, Premium, VIP) pode fazer e os limites por janela de tempo. Mudanças são aplicadas em tempo real.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as Plan)}>
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              {PLANS.map(p => <TabsTrigger key={p} value={p} className="capitalize">{p}</TabsTrigger>)}
            </TabsList>

            {PLANS.map(p => (
              <TabsContent key={p} value={p} className="space-y-6 mt-4">
                {/* Permissões */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Permissões ({permsByPlan.length})</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {permsByPlan.map(row => (
                      <div key={row.id} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{row.feature}</div>
                          {row.description && <div className="text-xs text-muted-foreground truncate">{row.description}</div>}
                        </div>
                        <Switch
                          checked={row.enabled}
                          disabled={saving === `p-${row.id}`}
                          onCheckedChange={(v) => togglePerm(row, v)}
                        />
                      </div>
                    ))}
                    {permsByPlan.length === 0 && <div className="text-xs text-muted-foreground">Sem permissões cadastradas para este plano.</div>}
                  </div>
                </div>

                {/* Limites */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Limites de Uso ({limitsByPlan.length})</h4>
                  <div className="space-y-2">
                    {limitsByPlan.map(row => (
                      <LimitRow
                        key={row.id}
                        row={row}
                        saving={saving === `l-${row.id}`}
                        onSave={(patch) => updateLimit(row, patch)}
                      />
                    ))}
                    {limitsByPlan.length === 0 && <div className="text-xs text-muted-foreground">Sem limites cadastrados para este plano.</div>}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function LimitRow({ row, saving, onSave }: { row: Limit; saving: boolean; onSave: (p: Partial<Limit>) => void }) {
  const [val, setVal] = useState(row.limit_value);
  const [period, setPeriod] = useState(row.period_seconds);
  useEffect(() => { setVal(row.limit_value); setPeriod(row.period_seconds); }, [row.id]);
  const dirty = val !== row.limit_value || period !== row.period_seconds;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 px-3 py-2">
      <div className="min-w-[140px] flex-1">
        <div className="text-sm font-medium">{row.feature}</div>
        {row.description && <div className="text-xs text-muted-foreground">{row.description}</div>}
      </div>
      <label className="text-xs text-muted-foreground flex items-center gap-1">
        Limite
        <Input type="number" min={0} className="h-8 w-20" value={val} onChange={(e) => setVal(Number(e.target.value))} />
      </label>
      <label className="text-xs text-muted-foreground flex items-center gap-1">
        Janela (s)
        <Input type="number" min={1} className="h-8 w-24" value={period} onChange={(e) => setPeriod(Number(e.target.value))} />
      </label>
      <Button size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty || saving} onClick={() => onSave({ limit_value: val, period_seconds: period })}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      </Button>
    </div>
  );
}
