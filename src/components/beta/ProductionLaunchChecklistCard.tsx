/**
 * ProductionLaunchChecklistCard — checklist obrigatório de produção, agrupado
 * por categoria (ASAAS, WhatsApp, Segurança, Realtime, Performance,
 * Moderação, Experiências Reais, Lançamento).
 *
 * O backend impede a transição platform_mode='production' enquanto houver
 * item required=true e done=false (trigger _guard_platform_production_transition).
 * Aqui exibimos status + permitimos marcar/desmarcar + adicionar notas + ver
 * quem aprovou e quando.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Loader2, CheckCircle2, AlertTriangle, ListChecks, Save, User2, Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Item {
  key: string;
  label: string;
  description: string | null;
  category: string;
  required: boolean;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  notes: string | null;
  sort_order: number;
}

const CATEGORY_ORDER = [
  'ASAAS', 'WhatsApp', 'Segurança', 'Realtime', 'Performance',
  'Moderação', 'Experiências Reais', 'Lançamento',
];

export function ProductionLaunchChecklistCard({
  onReadyChange,
}: {
  onReadyChange?: (ready: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from('platform_launch_checklist')
      .select('key,label,description,category,required,done,done_at,done_by,notes,sort_order')
      .order('sort_order', { ascending: true });
    if (!error && data) setItems(data as Item[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = subscribeTable('platform_launch_checklist', () => load());
    return () => { unsub(); };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const cat = it.category || 'Outros';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(it);
    }
    return [...map.entries()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [items]);

  const requiredPending = items.filter((i) => i.required && !i.done).length;
  const ready = requiredPending === 0 && items.length > 0;
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);

  const toggle = async (it: Item, v: boolean) => {
    setBusyKey(it.key);
    const { error } = await supabase
      .from('platform_launch_checklist')
      .update({ done: v })
      .eq('key', it.key);
    setBusyKey(null);
    if (error) {
      toast.error('Falha ao atualizar: ' + error.message);
      return;
    }
    toast.success(v ? `“${it.label}” marcado como concluído.` : `“${it.label}” reaberto.`);
  };

  const saveNotes = async (it: Item) => {
    const next = notesDraft[it.key] ?? it.notes ?? '';
    setBusyKey(it.key);
    const { error } = await supabase
      .from('platform_launch_checklist')
      .update({ notes: next })
      .eq('key', it.key);
    setBusyKey(null);
    if (error) {
      toast.error('Falha ao salvar nota: ' + error.message);
      return;
    }
    toast.success('Observação salva.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Checklist obrigatório de Produção
          </span>
          {ready ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Pronto para Produção
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {requiredPending} pendente(s)
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          O backend impede a transição para <strong>production</strong> enquanto houver itens obrigatórios pendentes
          (trigger <code className="text-[10px]">_guard_platform_production_transition</code>). Tentativas bloqueadas
          ficam registradas em <code className="text-[10px]">production_launch_log</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <Accordion type="multiple" defaultValue={grouped.map(([c]) => c)} className="space-y-2">
            {grouped.map(([cat, list]) => {
              const pending = list.filter((i) => i.required && !i.done).length;
              const total = list.filter((i) => i.required).length;
              return (
                <AccordionItem
                  key={cat}
                  value={cat}
                  className={cn(
                    'border rounded-lg px-3',
                    pending === 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5',
                  )}
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold w-full">
                      <span>{cat}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'ml-auto text-[10px]',
                          pending === 0
                            ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
                            : 'border-amber-500/50 text-amber-300 bg-amber-500/10',
                        )}
                      >
                        {total - pending}/{total}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-3">
                    <ul className="divide-y divide-border/40">
                      {list.map((it) => {
                        const draft = notesDraft[it.key] ?? it.notes ?? '';
                        const changed = draft !== (it.notes ?? '');
                        return (
                          <li key={it.key} className="py-3 space-y-2">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={`prodchk-${it.key}`}
                                checked={it.done}
                                disabled={busyKey === it.key}
                                onCheckedChange={(v) => toggle(it, Boolean(v))}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <label
                                  htmlFor={`prodchk-${it.key}`}
                                  className="text-sm font-medium cursor-pointer flex items-center gap-2 flex-wrap"
                                >
                                  {it.label}
                                  {it.required ? (
                                    <Badge variant="outline" className="text-[10px] py-0">obrigatório</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] py-0">opcional</Badge>
                                  )}
                                </label>
                                {it.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{it.description}</p>
                                )}
                                {it.done && (it.done_at || it.done_by) && (
                                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                    {it.done_at && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {new Date(it.done_at).toLocaleString('pt-BR')}
                                      </span>
                                    )}
                                    {it.done_by && (
                                      <span className="flex items-center gap-1">
                                        <User2 className="h-3 w-3" />
                                        <span className="font-mono truncate max-w-[14ch]">
                                          {it.done_by.slice(0, 8)}…
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="pl-7 space-y-1">
                              <Textarea
                                value={draft}
                                onChange={(e) =>
                                  setNotesDraft((d) => ({ ...d, [it.key]: e.target.value }))
                                }
                                placeholder="Observações (responsável, evidências, links de teste…)"
                                rows={2}
                                className="text-xs"
                              />
                              {changed && (
                                <div className="flex justify-end">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => saveNotes(it)}
                                    disabled={busyKey === it.key}
                                    className="h-7 text-xs gap-1"
                                  >
                                    {busyKey === it.key
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <Save className="h-3 w-3" />}
                                    Salvar nota
                                  </Button>
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
