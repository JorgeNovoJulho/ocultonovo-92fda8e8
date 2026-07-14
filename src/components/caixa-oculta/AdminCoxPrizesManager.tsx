/**
 * AdminCoxPrizesManager — edita prêmios de uma campanha, respeitando
 * allow_second_prize / allow_third_prize / allow_physical_prizes.
 */
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trash2, Save, Plus, AlertTriangle } from 'lucide-react';
import {
  useCoxPrizes,
  useUpsertCoxPrize,
  useDeleteCoxPrize,
  useCaixaOcultaSettings,
  type CoxPrize,
  type CoxPrizeKind,
} from '@/hooks/useCaixaOculta';

const KINDS: Array<{ value: CoxPrizeKind; label: string }> = [
  { value: 'digital', label: 'Digital' },
  { value: 'symbolic', label: 'Simbólico' },
  { value: 'highlight', label: 'Destaque' },
  { value: 'mention', label: 'Menção' },
  { value: 'custom_digital', label: 'Digital personalizado' },
];

interface Props { campaignId: string; }

export function AdminCoxPrizesManager({ campaignId }: Props) {
  const { data: prizes } = useCoxPrizes(campaignId);
  const { data: settings } = useCaixaOcultaSettings();
  const upsert = useUpsertCoxPrize();
  const del = useDeleteCoxPrize();

  const [draft, setDraft] = useState<Record<number, Partial<CoxPrize>>>({});

  useEffect(() => {
    const m: Record<number, Partial<CoxPrize>> = {};
    (prizes ?? []).forEach((p) => { m[p.prize_position] = p; });
    setDraft(m);
  }, [prizes]);

  const allow2 = settings?.allow_second_prize ?? true;
  const allow3 = settings?.allow_third_prize ?? true;

  const positions = [1, 2, 3].filter((pos) => pos === 1 || (pos === 2 && allow2) || (pos === 3 && allow3));

  const save = (pos: number) => {
    const d = draft[pos];
    if (!d?.title?.trim()) return;
    upsert.mutate({
      id: d.id,
      campaign_id: campaignId,
      prize_position: pos,
      title: d.title.trim(),
      description: d.description?.trim() || null,
      prize_kind: (d.prize_kind ?? 'digital') as CoxPrizeKind,
    } as any);
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Prêmios da campanha</h3>
        <div className="flex gap-1">
          <Badge variant={allow2 ? 'secondary' : 'outline'} className="text-[10px]">2º: {allow2 ? 'on' : 'off'}</Badge>
          <Badge variant={allow3 ? 'secondary' : 'outline'} className="text-[10px]">3º: {allow3 ? 'on' : 'off'}</Badge>
        </div>
      </div>

      {positions.map((pos) => {
        const d = draft[pos] ?? {};
        const existing = (prizes ?? []).find((p) => p.prize_position === pos);
        return (
          <div key={pos} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">{pos}º prêmio</p>
              {existing && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-600 h-7"
                  onClick={() => del.mutate({ id: existing.id, campaign_id: campaignId })}
                  disabled={del.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Remover
                </Button>
              )}
            </div>
            <Input
              placeholder="Título"
              value={d.title ?? ''}
              onChange={(e) => setDraft((s) => ({ ...s, [pos]: { ...s[pos], title: e.target.value.slice(0, 80) } }))}
            />
            <Input
              placeholder="Descrição (opcional)"
              value={d.description ?? ''}
              onChange={(e) => setDraft((s) => ({ ...s, [pos]: { ...s[pos], description: e.target.value.slice(0, 200) } }))}
            />
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={(d.prize_kind ?? 'digital') as string}
              onChange={(e) => setDraft((s) => ({ ...s, [pos]: { ...s[pos], prize_kind: e.target.value as CoxPrizeKind } }))}
            >
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <Button size="sm" onClick={() => save(pos)} disabled={upsert.isPending || !d.title?.trim()}>
              <Save className="h-3.5 w-3.5 mr-1" />{existing ? 'Atualizar' : 'Adicionar'}
            </Button>
          </div>
        );
      })}

      {(!allow2 || !allow3) && (
        <p className="text-[11px] text-amber-600 inline-flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          Posições desabilitadas pelas Configurações ficam ocultas. Ative-as em "Configurações" para gerenciar.
        </p>
      )}
    </div>
  );
}

export default AdminCoxPrizesManager;
