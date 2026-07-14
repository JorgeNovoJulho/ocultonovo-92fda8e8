/**
 * Painel do Criador VIP — Caixa Oculta
 * Lista + criação + envio para aprovação + sorteio manual.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Box, Plus, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import {
  useMyCaixaOculta,
  useSubmitCaixaOcultaForApproval,
  useDrawCaixaOculta,
  useCaixaOcultaSettings,
  type CoxPrizeKind,
} from '@/hooks/useCaixaOculta';
import { useQueryClient } from '@tanstack/react-query';
import { CoxCoverUploader } from '@/components/caixa-oculta/CoxCoverUploader';

interface PrizeDraft { position: number; title: string; description: string; prize_kind: CoxPrizeKind; }

const PRIZE_KINDS: Array<{ value: CoxPrizeKind; label: string }> = [
  { value: 'digital', label: 'Conteúdo digital' },
  { value: 'symbolic', label: 'Simbólico' },
  { value: 'highlight', label: 'Destaque no canal' },
  { value: 'mention', label: 'Menção especial' },
  { value: 'custom_digital', label: 'Personalizado digital' },
];

export default function CaixaOcultaCreatorPage() {
  const { user } = useAuth();
  const { data: campaigns, refetch } = useMyCaixaOculta();
  const { data: settings } = useCaixaOcultaSettings();
  const submit = useSubmitCaixaOcultaForApproval();
  const draw = useDrawCaixaOculta();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  return (
    <div className="container mx-auto p-4 max-w-3xl pb-24">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Box className="h-6 w-6 text-amber-500" />
          <div>
            <h1 className="text-xl font-bold">Minhas Caixas Ocultas</h1>
            <p className="text-xs text-muted-foreground">
              Campanhas sociais pagas em XP. Aprovação do Admin Master obrigatória.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </header>

      {creating && settings && (
        <CreateForm
          settings={settings}
          onClose={() => setCreating(false)}
          onCreated={() => { refetch(); qc.invalidateQueries({ queryKey: ['cox-mine'] }); }}
        />
      )}

      <div className="mt-4 space-y-3">
        {(campaigns ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{c.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {c.xp_cost} XP · {c.participants_count} participantes · Sorteio {new Date(c.draw_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <Badge variant="outline">{c.approval_status}</Badge>
              </div>
              {c.rejection_reason && <p className="text-xs text-rose-600">Motivo: {c.rejection_reason}</p>}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {c.approval_status === 'draft' && (
                  <Button size="sm" onClick={() => submit.mutate(c.id)} disabled={submit.isPending}>
                    Enviar para aprovação
                  </Button>
                )}
                {c.approval_status === 'pending_approval' && (
                  <span className="text-xs text-muted-foreground">Aguardando aprovação do Admin Master.</span>
                )}
                {c.approval_status === 'rejected' && (
                  <Button size="sm" variant="outline" onClick={() => submit.mutate(c.id)}>
                    Reenviar
                  </Button>
                )}
                {c.approval_status === 'approved' && !c.winners_drawn && (() => {
                  const drawTs = new Date(c.draw_at).getTime();
                  const tooEarly = drawTs > Date.now();
                  const enoughParts = (c.participants_count ?? 0) >= 1;
                  if (tooEarly) {
                    return <span className="text-xs text-muted-foreground">Disponível para sortear em {new Date(drawTs).toLocaleString('pt-BR')}.</span>;
                  }
                  if (!enoughParts) {
                    return <span className="text-xs text-amber-600">Sem participantes suficientes para sortear.</span>;
                  }
                  return (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!confirm('Confirmar apuração? Esta ação é irreversível.')) return;
                        draw.mutate(c.id);
                      }}
                      disabled={draw.isPending}
                    >
                      {draw.isPending ? 'Apurando…' : 'Sortear agora'}
                    </Button>
                  );
                })()}
                {c.winners_drawn && <Badge variant="secondary">Apurada</Badge>}
                <Button size="sm" variant="ghost" asChild className="ml-auto">
                  <Link to={`/caixa-oculta/${c.id}`}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />Acompanhar
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!campaigns?.length && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma Caixa Oculta ainda. Clique em "Nova" para começar.
          </p>
        )}
      </div>
    </div>
  );
}

function CreateForm({
  settings,
  onClose,
  onCreated,
}: {
  settings: { min_xp_cost: number; max_xp_cost: number; allow_second_prize: boolean; allow_third_prize: boolean };
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [xpCost, setXpCost] = useState(settings.min_xp_cost);
  const [drawAt, setDrawAt] = useState('');
  const [rules, setRules] = useState('');
  const [prizes, setPrizes] = useState<PrizeDraft[]>([
    { position: 1, title: '', description: '', prize_kind: 'digital' },
  ]);
  const [saving, setSaving] = useState(false);


  const addPrize = () => {
    if (prizes.length >= 3) return;
    setPrizes((p) => [...p, { position: p.length + 1, title: '', description: '', prize_kind: 'digital' }]);
  };

  const submit = async () => {
    if (!user) return;
    if (title.trim().length < 3) return toast.error('Título muito curto.');
    if (description.trim().length < 10) return toast.error('Descrição muito curta.');
    if (!drawAt) return toast.error('Defina a data do sorteio.');
    if (new Date(drawAt).getTime() <= Date.now() + 30 * 60_000) return toast.error('Sorteio precisa ser pelo menos 30 min no futuro.');
    if (xpCost < settings.min_xp_cost || xpCost > settings.max_xp_cost) {
      return toast.error(`XP deve estar entre ${settings.min_xp_cost} e ${settings.max_xp_cost}.`);
    }
    if (!prizes[0].title.trim()) return toast.error('O 1º prêmio é obrigatório.');

    setSaving(true);
    try {
      const { data: campaign, error } = await (supabase as any)
        .from('oculto_caixa_oculta_campaigns')
        .insert({
          creator_id: user.id,
          title: title.trim(),
          description: description.trim(),
          cover_url: coverUrl.trim() || null,
          xp_cost: xpCost,
          draw_at: new Date(drawAt).toISOString(),
          rules: rules.trim() || null,
          status: 'draft',
          approval_status: 'draft',
        })
        .select()
        .single();
      if (error) throw error;

      const prizeRows = prizes
        .filter((p) => p.title.trim())
        .map((p) => ({
          campaign_id: campaign.id,
          prize_position: p.position,
          title: p.title.trim(),
          description: p.description.trim() || null,
          prize_kind: p.prize_kind,
        }));
      const { error: pErr } = await (supabase as any).from('oculto_caixa_oculta_prizes').insert(prizeRows);
      if (pErr) throw pErr;

      toast.success('Caixa Oculta criada como rascunho. Envie para aprovação.');
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao criar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className="font-semibold">Nova Caixa Oculta</h2>
        <div>
          <Label className="text-xs">Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} maxLength={80} />
        </div>
        <div>
          <Label className="text-xs">Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} maxLength={500} rows={3} />
        </div>
        <CoxCoverUploader value={coverUrl} onChange={setCoverUrl} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">XP por participação</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={settings.min_xp_cost}
              max={settings.max_xp_cost}
              value={xpCost}
              onChange={(e) => setXpCost(Math.max(1, parseInt(e.target.value || '1', 10)))}
            />
          </div>
          <div>
            <Label className="text-xs">Data e hora do sorteio</Label>
            <Input type="datetime-local" value={drawAt} onChange={(e) => setDrawAt(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Regras (opcional)</Label>
          <Textarea value={rules} onChange={(e) => setRules(e.target.value.slice(0, 1000))} maxLength={1000} rows={2} />
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Prêmios</Label>
            {prizes.length < 3 && (settings.allow_second_prize || prizes.length < 1) && (
              <Button size="sm" variant="outline" onClick={addPrize}>+ Prêmio</Button>
            )}
          </div>
          {prizes.map((p, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-medium">{i + 1}º prêmio</p>
              <Input
                placeholder="Título do prêmio"
                value={p.title}
                onChange={(e) => setPrizes((arr) => arr.map((x, idx) => idx === i ? { ...x, title: e.target.value.slice(0, 80) } : x))}
              />
              <Input
                placeholder="Descrição (opcional)"
                value={p.description}
                onChange={(e) => setPrizes((arr) => arr.map((x, idx) => idx === i ? { ...x, description: e.target.value.slice(0, 200) } : x))}
              />
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={p.prize_kind}
                onChange={(e) => setPrizes((arr) => arr.map((x, idx) => idx === i ? { ...x, prize_kind: e.target.value as CoxPrizeKind } : x))}
              >
                {PRIZE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Prêmios físicos e dinheiro real não são permitidos.</p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={submit} disabled={saving}>{saving ? 'Salvando…' : 'Salvar rascunho'}</Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
