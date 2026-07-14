/**
 * Admin Master — Caixa Oculta
 * Aprovação, gestão, cancelamento, configurações e logs.
 */
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Box, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import {
  useAdminCoxCampaigns,
  useAdminCoxAuditLogs,
  useApproveCaixaOculta,
  useRejectCaixaOculta,
  useCancelCaixaOculta,
  useCaixaOcultaSettings,
  type CoxAdminFilter,
  type CoxSettings,
} from '@/hooks/useCaixaOculta';
import { AdminCoxPrizesManager } from '@/components/caixa-oculta/AdminCoxPrizesManager';
import { AdminCoxHistoryPanel } from '@/components/caixa-oculta/AdminCoxHistoryPanel';

function StatusBadge({ approval, status }: { approval: string; status: string }) {
  const aMap: Record<string, string> = {
    pending_approval: 'bg-amber-500/15 text-amber-600',
    approved: 'bg-emerald-500/15 text-emerald-600',
    rejected: 'bg-rose-500/15 text-rose-600',
    draft: 'bg-muted text-muted-foreground',
  };
  const sMap: Record<string, string> = {
    drawn: 'bg-indigo-500/15 text-indigo-600',
    cancelled: 'bg-zinc-500/15 text-zinc-600',
    active: 'bg-sky-500/15 text-sky-600',
  };
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Badge className={aMap[approval] ?? ''} variant="secondary">{approval}</Badge>
      <Badge className={sMap[status] ?? ''} variant="outline">{status}</Badge>
    </div>
  );
}

export default function AdminCaixaOcultaPage() {
  return (
    <div className="container mx-auto p-4 max-w-5xl">
      <header className="mb-6 flex items-center gap-3">
        <Box className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">Caixa Oculta</h1>
          <p className="text-sm text-muted-foreground">Aprovação, gestão, cancelamento e configurações.</p>
        </div>
      </header>

      <Tabs defaultValue="pending_approval">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="pending_approval">Pendentes</TabsTrigger>
          <TabsTrigger value="approved">Aprovadas</TabsTrigger>
          <TabsTrigger value="drawn">Apuradas</TabsTrigger>
          <TabsTrigger value="rejected">Reprovadas</TabsTrigger>
          <TabsTrigger value="cancelled">Canceladas</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="pending_approval"><CampaignList filter="pending_approval" /></TabsContent>
        <TabsContent value="approved"><CampaignList filter="approved" /></TabsContent>
        <TabsContent value="drawn"><CampaignList filter="drawn" /></TabsContent>
        <TabsContent value="rejected"><CampaignList filter="rejected" /></TabsContent>
        <TabsContent value="cancelled"><CampaignList filter="cancelled" /></TabsContent>
        <TabsContent value="history"><AdminCoxHistoryPanel /></TabsContent>
        <TabsContent value="settings"><SettingsPanel /></TabsContent>
        <TabsContent value="logs"><LogsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function CampaignList({ filter }: { filter: CoxAdminFilter }) {
  const { data, isLoading } = useAdminCoxCampaigns(filter);
  const { data: settings } = useCaixaOcultaSettings();
  const approve = useApproveCaixaOculta();
  const reject = useRejectCaixaOculta();
  const cancel = useCancelCaixaOculta();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [openPrizes, setOpenPrizes] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground mt-4">Carregando…</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground mt-4">Nada por aqui.</p>;

  const defaultRefund = settings?.refund_xp_on_cancel ?? true;

  return (
    <div className="mt-4 space-y-3">
      {data.map((c) => (
        <div key={c.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate">{c.title}</h3>
                <StatusBadge approval={c.approval_status} status={c.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 break-all">
                Criador: <code>{c.creator_id.slice(0, 8)}…</code> · XP: {c.xp_cost} · Participantes: {c.participants_count}
              </p>
              <p className="text-xs text-muted-foreground">
                Sorteio: {new Date(c.draw_at).toLocaleString('pt-BR')}
                {c.drawn_at && ` · Apurada: ${new Date(c.drawn_at).toLocaleString('pt-BR')}`}
              </p>
              {c.description && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{c.description}</p>
              )}
              {c.rejection_reason && (
                <p className="text-xs text-rose-600 mt-1">Motivo: {c.rejection_reason}</p>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {c.approval_status === 'pending_approval' && (
                <>
                  <Button size="sm" onClick={() => approve.mutate(c.id)} disabled={approve.isPending}>
                    Aprovar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejectingId(c.id)}>
                    Reprovar
                  </Button>
                </>
              )}
              {c.approval_status === 'approved' && !c.winners_drawn && c.status !== 'cancelled' && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => cancel.mutate({ id: c.id, refund: defaultRefund })}
                  disabled={cancel.isPending}
                >
                  Cancelar {defaultRefund ? '(reembolsa XP)' : '(sem reembolso)'}
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <Link to={`/caixa-oculta/${c.id}`}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />Acompanhar
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpenPrizes((id) => (id === c.id ? null : c.id))}
              >
                {openPrizes === c.id ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                Prêmios
              </Button>
            </div>
          </div>

          {openPrizes === c.id && (
            <div className="mt-3">
              <AdminCoxPrizesManager campaignId={c.id} />
            </div>
          )}

          {rejectingId === c.id && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder="Motivo da reprovação (obrigatório)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => {
                  if (!reason.trim()) { toast.error('Informe um motivo.'); return; }
                  reject.mutate(
                    { id: c.id, reason: reason.trim() },
                    { onSuccess: () => { setRejectingId(null); setReason(''); } }
                  );
                }}>Confirmar reprovação</Button>
                <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setReason(''); }}>
                  Voltar
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SettingsPanel() {
  const { data, refetch } = useCaixaOcultaSettings();
  const [local, setLocal] = useState<Partial<CoxSettings>>({});
  const eff = { ...(data ?? {}), ...local } as CoxSettings;

  if (!data) return <p className="text-sm text-muted-foreground mt-4">Carregando…</p>;

  const save = async () => {
    const { error } = await (supabase as any)
      .from('oculto_caixa_oculta_settings')
      .update(local)
      .gt('created_at', '1970-01-01');
    if (error) { toast.error(error.message); return; }
    toast.success('Configurações salvas.');
    setLocal({});
    refetch();
  };

  const Toggle = ({ k, label, hint }: { k: keyof CoxSettings; label: string; hint?: string }) => (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch
        checked={!!eff[k]}
        onCheckedChange={(v) => setLocal((p) => ({ ...p, [k]: v }))}
      />
    </div>
  );

  return (
    <div className="mt-4 space-y-2 rounded-xl border bg-card p-4">
      <Toggle k="enabled" label="Função ativa" />
      <Toggle k="require_admin_approval" label="Exigir aprovação do Admin Master" />
      <Toggle k="creator_vip_only" label="Apenas Criadores VIP podem criar" />
      <Toggle k="allow_second_prize" label="Permitir segundo prêmio" />
      <Toggle k="allow_third_prize" label="Permitir terceiro prêmio" />
      <Toggle k="show_participants_publicly" label="Mostrar participantes publicamente" />
      <Toggle k="show_in_feed" label="Mostrar no feed principal" />
      <Toggle
        k="refund_xp_on_cancel"
        label="Estornar XP ao cancelar"
        hint="Quando uma campanha for cancelada com participantes, o XP gasto é devolvido."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
        <div>
          <Label className="text-xs">XP mínimo</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={eff.min_xp_cost ?? 1}
            onChange={(e) => setLocal((p) => ({ ...p, min_xp_cost: Math.max(1, parseInt(e.target.value || '1', 10)) }))}
          />
        </div>
        <div>
          <Label className="text-xs">XP máximo</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={eff.max_xp_cost ?? 10000}
            onChange={(e) => setLocal((p) => ({ ...p, max_xp_cost: Math.max(1, parseInt(e.target.value || '1', 10)) }))}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Nome da função</Label>
          <Input
            value={eff.custom_feature_name ?? 'Caixa Oculta'}
            onChange={(e) => setLocal((p) => ({ ...p, custom_feature_name: e.target.value.slice(0, 60) }))}
          />
        </div>
      </div>

      <div className="pt-3">
        <Button onClick={save} disabled={Object.keys(local).length === 0}>
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}

function LogsPanel() {
  const { data, isLoading } = useAdminCoxAuditLogs(200);
  if (isLoading) return <p className="text-sm text-muted-foreground mt-4">Carregando logs…</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground mt-4">Sem registros.</p>;

  return (
    <div className="mt-4 space-y-2">
      {data.map((l) => (
        <div key={l.id} className="rounded-lg border bg-card p-3 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge variant="secondary" className="font-mono">{l.action}</Badge>
            <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString('pt-BR')}</span>
          </div>
          <p className="mt-1 text-muted-foreground break-all">
            Campanha: <code>{l.campaign_id?.slice(0, 8) ?? '—'}</code> · Ator: <code>{l.actor_id?.slice(0, 8) ?? '—'}</code>
          </p>
          {l.new_data && Object.keys(l.new_data).length > 0 && (
            <pre className="mt-1 text-[11px] bg-muted/30 rounded p-2 overflow-x-auto">
              {JSON.stringify(l.new_data, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
