/**
 * Admin Master → Plataforma → Beta Control
 * Single source of truth: platform_runtime_settings.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Save, Sparkles, ShieldAlert, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { usePlatformPhase, type PlatformRuntime, type PlatformMode } from '@/hooks/usePlatformPhase';
import { AuditHistoryCard } from '@/components/beta/AuditHistoryCard';
import { PrelaunchSnapshotCard } from '@/components/beta/PrelaunchSnapshotCard';
import { BetaLockedCtasCard } from '@/components/beta/BetaLockedCtasCard';
import { BetaBlockedAttemptsCard } from '@/components/beta/BetaBlockedAttemptsCard';
import { ProductionLaunchChecklistCard } from '@/components/beta/ProductionLaunchChecklistCard';
import { ProductionLaunchLogCard } from '@/components/beta/ProductionLaunchLogCard';
import { BetaGrantsCard } from '@/components/beta/BetaGrantsCard';

const TOGGLES: Array<{ key: keyof PlatformRuntime; label: string; help: string }> = [
  { key: 'beta_free_has_premium_social', label: 'FREE recebe Premium social (beta)', help: 'Libera Aura avançada, salas, radar expandido e pulsos para usuários gratuitos durante o beta.' },
  { key: 'beta_founders_enabled', label: 'Programa Fundadores Beta', help: 'Marca usuários do beta com badge Fundador.' },
  { key: 'monetization_enabled', label: 'Monetização real (master switch)', help: 'Quando OFF, nenhuma cobrança real é processada.' },
  { key: 'subscriptions_enabled', label: 'Assinaturas Premium / VIP', help: 'Permite checkout de assinaturas reais.' },
  { key: 'vip_channels_enabled', label: 'Canais VIP de criadores', help: 'Permite assinar canais pagos de criadores.' },
  { key: 'paid_content_enabled', label: 'Conteúdo pago (PPV, mídia bloqueada)', help: 'Permite compra de mídias avulsas e PPV.' },
  { key: 'payouts_enabled', label: 'Saques de criadores', help: 'Permite solicitar retirada do saldo.' },
  { key: 'safe_meetings_enabled', label: 'Encontros seguros', help: 'Permite agendar encontros com check-in.' },
  { key: 'whatsapp_enabled', label: 'Integração WhatsApp', help: 'Permite envios automáticos via WhatsApp.' },
  { key: 'real_experiences_enabled', label: 'Experiências reais', help: 'Habilita reservas/eventos presenciais.' },
];

const VIP_CHANNEL_TOGGLES: Array<{ key: keyof PlatformRuntime; label: string; help: string }> = [
  { key: 'vip_narrative_enabled', label: 'Seções narrativas (Histórias, Capítulos, Diário, Textos)', help: 'Permite que criadores publiquem conteúdo de leitura no Canal VIP.' },
  { key: 'vip_feed_cards_enabled', label: 'Chamadas narrativas no feed principal', help: 'Exibe card dourado especial no feed quando um criador publica narrativa.' },
  { key: 'vip_continue_reading_enabled', label: '"Continue lendo" nos Canais VIP', help: 'Mostra faixa de leituras inacabadas no topo do canal.' },
  { key: 'vip_pin_enabled', label: 'Posts fixados pelo criador', help: 'Criador pode fixar até X posts/capítulos/séries no topo de cada seção.' },
  { key: 'vip_special_reactions_enabled', label: 'Reações especiais (💜 🔥 ⚡ 🌙)', help: 'Reações extras em conteúdo do Canal VIP. Reaproveita a infra de reactions/likes existente.' },
  { key: 'vip_schedule_enabled', label: 'Agendamento (scheduled_at)', help: 'Permite agendar capítulos, séries e diários — só aparecem após a data.' },
  { key: 'vip_share_enabled', label: 'Compartilhamento de conteúdo VIP', help: 'Habilita botão Compartilhar com link direto para capítulo/série/teaser.' },
  { key: 'vip_analytics_enabled', label: 'Analytics do Canal VIP', help: 'Exibe métricas (leituras por seção, top narrativas, beta vs real) no Painel do Criador.' },
];


export default function AdminBetaControlPage() {
  const { runtime: live } = usePlatformPhase();
  const [draft, setDraft] = useState<PlatformRuntime>(live);
  const [saving, setSaving] = useState(false);
  const [checklistReady, setChecklistReady] = useState(false);

  useEffect(() => { setDraft(live); }, [live.id, live.updated_at]); // eslint-disable-line

  const setMode = (mode: PlatformMode) => setDraft((d) => ({ ...d, platform_mode: mode }));
  const setBool = (k: keyof PlatformRuntime, v: boolean) => setDraft((d) => ({ ...d, [k]: v } as PlatformRuntime));

  const save = async () => {
    // Guard: bloqueia transição p/ Produção se checklist obrigatório não estiver pronto
    if (
      draft.platform_mode === 'production' &&
      live.platform_mode !== 'production' &&
      draft.launch_checklist_required &&
      !checklistReady
    ) {
      toast.error('Conclua todos os itens obrigatórios do checklist antes de ir para Produção.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_runtime_settings')
        .update({
          platform_mode: draft.platform_mode,
          beta_enabled: draft.beta_enabled,
          beta_free_has_premium_social: draft.beta_free_has_premium_social,
          beta_founders_enabled: draft.beta_founders_enabled,
          monetization_enabled: draft.monetization_enabled,
          subscriptions_enabled: draft.subscriptions_enabled,
          vip_channels_enabled: draft.vip_channels_enabled,
          paid_content_enabled: draft.paid_content_enabled,
          payouts_enabled: draft.payouts_enabled,
          safe_meetings_enabled: draft.safe_meetings_enabled,
          whatsapp_enabled: draft.whatsapp_enabled,
          real_experiences_enabled: draft.real_experiences_enabled,
          launch_checklist_required: draft.launch_checklist_required,
          beta_welcome_title: draft.beta_welcome_title,
          beta_welcome_message: draft.beta_welcome_message,
          vip_narrative_enabled: draft.vip_narrative_enabled,
          vip_continue_reading_enabled: draft.vip_continue_reading_enabled,
          vip_pin_enabled: draft.vip_pin_enabled,
          vip_special_reactions_enabled: draft.vip_special_reactions_enabled,
          vip_schedule_enabled: draft.vip_schedule_enabled,
          vip_share_enabled: draft.vip_share_enabled,
          vip_analytics_enabled: draft.vip_analytics_enabled,
          vip_feed_cards_enabled: draft.vip_feed_cards_enabled,
        })
        .eq('id', draft.id);
      if (error) throw error;
      toast.success('Configuração aplicada — realtime para todos os usuários.');
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('CHECKLIST_INCOMPLETO')) {
        toast.error('Checklist incompleto — produção bloqueada pelo backend.', {
          description: msg.replace(/^.*CHECKLIST_INCOMPLETO:\s*/, ''),
          duration: 6000,
        });
      } else {
        toast.error('Falha ao salvar: ' + (msg || 'erro desconhecido'));
      }

    } finally {
      setSaving(false);
    }
  };

  const goProduction = () => {
    setDraft((d) => ({
      ...d,
      platform_mode: 'production',
      beta_free_has_premium_social: false,
      monetization_enabled: true,
      subscriptions_enabled: true,
      vip_channels_enabled: true,
      paid_content_enabled: true,
      payouts_enabled: true,
      safe_meetings_enabled: true,
      whatsapp_enabled: true,
      real_experiences_enabled: true,
    }));
  };

  return (
    <div className="container max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Beta Control — Plataforma Oculto
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle global de fase e disponibilidade de features. Aplica em tempo real.
          </p>
        </div>
        <Badge variant={live.platform_mode === 'beta' ? 'default' : live.platform_mode === 'production' ? 'secondary' : 'destructive'}>
          Atual: {live.platform_mode.toUpperCase()}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fase da plataforma</CardTitle>
          <CardDescription>Escolha o modo operacional.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={draft.platform_mode} onValueChange={(v) => setMode(v as PlatformMode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="beta"><Sparkles className="h-4 w-4 mr-1" /> Beta</TabsTrigger>
              <TabsTrigger value="production"><ShieldAlert className="h-4 w-4 mr-1" /> Produção</TabsTrigger>
              <TabsTrigger value="maintenance"><Wrench className="h-4 w-4 mr-1" /> Manutenção</TabsTrigger>
            </TabsList>
            <TabsContent value="beta" className="text-sm text-muted-foreground pt-3">
              FREE ganha Premium social temporariamente. Monetização real desativada por padrão.
            </TabsContent>
            <TabsContent value="production" className="text-sm text-muted-foreground pt-3">
              Lançamento oficial — todas as features pagas habilitadas. O preset abaixo só é liberado quando o checklist obrigatório estiver 100% concluído.
              <Button
                size="sm"
                variant="outline"
                className="mt-2 ml-0 block"
                onClick={goProduction}
                disabled={draft.launch_checklist_required && !checklistReady}
                title={!checklistReady ? 'Conclua o checklist de pré-lançamento primeiro' : ''}
              >
                Aplicar preset de Produção
              </Button>
            </TabsContent>
            <TabsContent value="maintenance" className="text-sm text-muted-foreground pt-3">
              Modo manutenção — exibe avisos globais e bloqueia escritas críticas (a ser ligado em guards de checkout).
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Toggles de features</CardTitle>
          <CardDescription>Cada toggle controla guards no app inteiro em tempo real.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {TOGGLES.map((t) => (
            <div key={t.key as string} className="flex items-start justify-between gap-4 py-3">
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium">{t.label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t.help}</p>
              </div>
              <Switch
                checked={Boolean(draft[t.key])}
                onCheckedChange={(v) => setBool(t.key, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" /> Canais VIP — recursos de retenção
          </CardTitle>
          <CardDescription>Controla seções narrativas, comunidade, agendamento e analytics dos Canais VIP.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {VIP_CHANNEL_TOGGLES.map((t) => (
            <div key={t.key as string} className="flex items-start justify-between gap-4 py-3">
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium">{t.label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t.help}</p>
              </div>
              <Switch
                checked={Boolean(draft[t.key])}
                onCheckedChange={(v) => setBool(t.key, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modal de boas-vindas do Beta</CardTitle>
          <CardDescription>Mostrado na primeira entrada do usuário enquanto a fase for "beta".</CardDescription>

        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-sm">Título</Label>
            <Input
              value={draft.beta_welcome_title}
              onChange={(e) => setDraft((d) => ({ ...d, beta_welcome_title: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-sm">Mensagem</Label>
            <Textarea
              rows={4}
              value={draft.beta_welcome_message}
              onChange={(e) => setDraft((d) => ({ ...d, beta_welcome_message: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <ProductionLaunchChecklistCard onReadyChange={setChecklistReady} />

      <ProductionLaunchLogCard />

      <BetaGrantsCard />

      <BetaLockedCtasCard />

      <BetaBlockedAttemptsCard />

      <PrelaunchSnapshotCard />

      <AuditHistoryCard />

      <div className="sticky bottom-4 z-10">
        <Button size="lg" className="w-full" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar e aplicar em tempo real
        </Button>
      </div>
    </div>
  );
}
