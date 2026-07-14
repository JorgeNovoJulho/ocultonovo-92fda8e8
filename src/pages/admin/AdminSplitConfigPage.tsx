import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, AlertTriangle, CheckCircle2, Percent, History } from 'lucide-react';
import { useSplitConfig, useSplitConfigHistory, useUpdateSplitConfig } from '@/hooks/useSplitConfig';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const FIELDS: Array<{
  key: 'platform' | 'tax' | 'creator' | 'affiliate';
  label: string;
  tooltip: string;
  color: string;
}> = [
  { key: 'platform', label: 'Plataforma', tooltip: 'Percentual retido pela OCULTO sobre a base líquida (após imposto).', color: 'bg-primary' },
  { key: 'tax', label: 'Impostos', tooltip: 'Percentual reservado para tributos sobre o valor BRUTO. Não entra na wallet.', color: 'bg-amber-500' },
  { key: 'creator', label: 'Criador', tooltip: 'Percentual líquido destinado ao criador de conteúdo (vai para pending_balance, liberado em 7 dias).', color: 'bg-emerald-500' },
  { key: 'affiliate', label: 'Afiliado', tooltip: 'Percentual destinado a quem indicou o pagador (quando houver afiliado ativo).', color: 'bg-violet-500' },
];

export default function AdminSplitConfigPage() {
  const { data: active, isLoading } = useSplitConfig();
  const { data: history } = useSplitConfigHistory(10);
  const update = useUpdateSplitConfig();

  const [values, setValues] = useState({ platform: 20, tax: 6, creator: 69, affiliate: 5 });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (active) {
      setValues({
        platform: Number(active.platform_percent),
        tax: Number(active.tax_percent),
        creator: Number(active.creator_percent),
        affiliate: Number(active.affiliate_percent),
      });
    }
  }, [active]);

  const sum = +(values.platform + values.tax + values.creator + values.affiliate).toFixed(2);
  const isValid = sum === 100 && Object.values(values).every((v) => v >= 0);

  const onSave = () => {
    if (!isValid) return;
    update.mutate({ ...values, notes: notes || undefined });
  };

  // Preview de R$ 100
  const preview = (() => {
    const gross = 100;
    const tax = +(gross * values.tax / 100).toFixed(2);
    const base = +(gross - tax).toFixed(2);
    const platform = +(base * values.platform / 100).toFixed(2);
    const affiliate = +(base * values.affiliate / 100).toFixed(2);
    const creator = +(base - platform - affiliate).toFixed(2);
    return { gross, tax, base, platform, affiliate, creator };
  })();

  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-8 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Configuração de Split Financeiro</h1>
          <p className="text-muted-foreground mt-1">
            Define os percentuais aplicados em <strong>todas</strong> as transações (PIX, cartão, assinaturas, conteúdo pago, chat monetizado).
          </p>
        </div>

        {/* Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="w-5 h-5" /> Percentuais Ativos
            </CardTitle>
            <CardDescription>
              A soma dos quatro campos deve ser exatamente <strong>100%</strong>. As alterações são aplicadas instantaneamente nas próximas cobranças confirmadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="space-y-2">
                      <div className="flex items-center gap-1">
                        <Label htmlFor={f.key}>{f.label}</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground"><Info className="w-3.5 h-3.5" /></button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">{f.tooltip}</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="relative">
                        <Input
                          id={f.key}
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={values[f.key]}
                          onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) || 0 }))}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Barra de soma */}
                <div className={`flex items-center justify-between p-3 rounded-lg border ${isValid ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-destructive/40 bg-destructive/10'}`}>
                  <div className="flex items-center gap-2">
                    {isValid ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-destructive" />}
                    <span className="font-medium">Soma total: {sum}%</span>
                  </div>
                  <Badge variant={isValid ? 'default' : 'destructive'}>{isValid ? 'Válido' : 'Ajuste necessário'}</Badge>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas (opcional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Ex: ajuste sazonal de Black Friday"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <Button onClick={onSave} disabled={!isValid || update.isPending} className="w-full md:w-auto">
                  {update.isPending ? 'Salvando…' : 'Aplicar nova configuração'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Simulação — venda bruta de R$ 100,00</CardTitle>
            <CardDescription>Demonstra o cálculo aplicado no fluxo <code>creator_content</code> com afiliado ativo.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Bruto" value={preview.gross} />
              <Stat label="Imposto" value={preview.tax} tone="amber" />
              <Stat label="Base" value={preview.base} muted />
              <Stat label="Plataforma" value={preview.platform} tone="primary" />
              <Stat label="Afiliado" value={preview.affiliate} tone="violet" />
              <Stat label="Criador (líquido)" value={preview.creator} tone="emerald" wide />
            </div>
          </CardContent>
        </Card>

        {/* Histórico */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Histórico</CardTitle>
            <CardDescription>Últimas configurações aplicadas (auditoria).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(history ?? []).map((h: any) => (
                <div key={h.id} className="flex items-center justify-between p-3 border rounded-md text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    {h.is_active && <Badge>Ativa</Badge>}
                    <span>P {h.platform_percent}% · I {h.tax_percent}% · C {h.creator_percent}% · A {h.affiliate_percent}%</span>
                    {h.notes && <span className="text-muted-foreground">— {h.notes}</span>}
                  </div>
                  <span className="text-muted-foreground">
                    {format(new Date(h.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}
              {!history?.length && <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function Stat({ label, value, tone, muted, wide }: { label: string; value: number; tone?: string; muted?: boolean; wide?: boolean }) {
  const colors: Record<string, string> = {
    amber: 'text-amber-500',
    primary: 'text-primary',
    violet: 'text-violet-500',
    emerald: 'text-emerald-500',
  };
  return (
    <div className={`p-3 rounded-md border ${wide ? 'col-span-2 md:col-span-1' : ''}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${tone ? colors[tone] : muted ? 'text-muted-foreground' : ''}`}>
        R$ {value.toFixed(2)}
      </p>
    </div>
  );
}
