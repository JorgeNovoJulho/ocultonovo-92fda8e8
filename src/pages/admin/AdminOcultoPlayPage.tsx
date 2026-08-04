/**
 * AdminOcultoPlayPage — Etapas 2+5 (somente Master Admin).
 * Tabs: Configurações | Moderação | Estatísticas.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Play, ShieldAlert, Sparkles, BarChart3, Settings2, Flag, Star, EyeOff, TrendingUp, Calendar, ListMusic, LayoutDashboard, Film, Trophy, RotateCcw, FileText, Music, ArrowUpRight, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

import { useOcultoPlayConfig, type OcultoPlayConfig } from '@/hooks/useOcultoPlayAccess';
import { useOcultoPlayAdminStats } from '@/hooks/useOcultoPlayModeration';
import { AdminOcultoPlayModerationPanel } from '@/components/admin/AdminOcultoPlayModerationPanel';
import { AdminOcultoPlayTodayPanel } from '@/components/admin/AdminOcultoPlayTodayPanel';
import { AdminOcultoPlayLaunchCard } from '@/components/admin/AdminOcultoPlayLaunchCard';
import { AdminOcultoPlayAutoHiddenPanel } from '@/components/admin/AdminOcultoPlayAutoHiddenPanel';
import { AdminOcultoPlayRetentionPanel } from '@/components/admin/AdminOcultoPlayRetentionPanel';
import { AdminOcultoPlayHeatmapPanel } from '@/components/admin/AdminOcultoPlayHeatmapPanel';
import { AdminOcultoPlayPlaylistsPanel } from '@/components/admin/AdminOcultoPlayPlaylistsPanel';
import { AdminOcultoPlayOverviewPanel } from '@/components/admin/AdminOcultoPlayOverviewPanel';
import { AdminOcultoPlayContentPanel } from '@/components/admin/AdminOcultoPlayContentPanel';
import { AdminOcultoPlayChallengesPanel } from '@/components/admin/AdminOcultoPlayChallengesPanel';
import { AdminOcultoPlayReturnHooksPanel } from '@/components/admin/AdminOcultoPlayReturnHooksPanel';
import { AdminOcultoPlayLogsPanel } from '@/components/admin/AdminOcultoPlayLogsPanel';
import { AdminOcultoPlayEtapa10MetricsPanel } from '@/components/admin/AdminOcultoPlayEtapa10MetricsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type ToggleKey = keyof Pick<
  OcultoPlayConfig,
  | 'enabled' | 'visible_to_users' | 'beta_open'
  | 'short_videos_on' | 'memes_on' | 'audios_on' | 'vip_teasers_on'
  | 'communities_on' | 'challenges_on' | 'gamification_on'
  | 'today_section_on' | 'comeback_section_on'
>;

const KILLSWITCHES: { key: ToggleKey; label: string; help: string }[] = [
  { key: 'enabled', label: 'Killswitch global', help: 'Liga/desliga TODO o OCULTO PLAY. Desligado = ninguém (exceto Master) tem acesso.' },
  { key: 'visible_to_users', label: 'Visível para usuários (lançamento)', help: 'Quando ligado e killswitch ON, qualquer usuário logado verá o menu.' },
  { key: 'beta_open', label: 'Beta aberto', help: 'Libera o Play para todos os logados durante o beta. Allowlist segue valendo.' },
];

const SECTIONS: { key: ToggleKey; label: string }[] = [
  { key: 'short_videos_on', label: 'Vídeos curtos' },
  { key: 'memes_on', label: 'Memes / Imagens' },
  { key: 'audios_on', label: 'Áudios autorais (MP3)' },
  { key: 'vip_teasers_on', label: 'Teasers VIP' },
  { key: 'communities_on', label: 'Conteúdo de Comunidades' },
  { key: 'challenges_on', label: 'Desafios' },
  { key: 'gamification_on', label: 'Gamificação / XP' },
  { key: 'today_section_on', label: 'Hoje no Oculto' },
  { key: 'comeback_section_on', label: 'Volte para Ver' },
];

export default function AdminOcultoPlayPage() {
  const navigate = useNavigate();
  const { data: cfg, isLoading } = useOcultoPlayConfig();

  const qc = useQueryClient();
  const [draft, setDraft] = useState<OcultoPlayConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const persistingRef = useRef<Set<string>>(new Set());

  useEffect(() => { if (cfg) setDraft(cfg); }, [cfg]);

  const setField = <K extends keyof OcultoPlayConfig>(k: K, v: OcultoPlayConfig[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  };

  /** Auto-persiste toggles imediatamente (switches do Acesso global / Seções). */
  const persistToggle = async <K extends keyof OcultoPlayConfig>(k: K, v: OcultoPlayConfig[K]) => {
    if (!draft) return;
    const prev = draft[k];
    setField(k, v);
    persistingRef.current.add(String(k));
    const { error } = await supabase
      .from('oculto_play_config' as never)
      .update({ [k]: v } as never)
      .eq('id', draft.id);
    persistingRef.current.delete(String(k));
    if (error) {
      setField(k, prev); // rollback
      toast.error('Não foi possível salvar: ' + error.message);
      return;
    }
    // Invalida caches que dependem de acesso/visibilidade
    qc.invalidateQueries({ queryKey: ['oculto-play'] });
    toast.success(v ? 'Ativado e liberado' : 'Desativado e ocultado', { duration: 1600 });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const { error } = await supabase
      .from('oculto_play_config' as never)
      .update({
        enabled: draft.enabled,
        visible_to_users: draft.visible_to_users,
        beta_open: draft.beta_open,
        short_videos_on: draft.short_videos_on,
        memes_on: draft.memes_on,
        audios_on: draft.audios_on,
        vip_teasers_on: draft.vip_teasers_on,
        communities_on: draft.communities_on,
        challenges_on: draft.challenges_on,
        gamification_on: draft.gamification_on,
        today_section_on: draft.today_section_on,
        comeback_section_on: draft.comeback_section_on,
        notes: draft.notes,
      } as never)
      .eq('id', draft.id);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Configuração do OCULTO PLAY atualizada');
  };

  if (isLoading || !draft) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <header className="flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <Play className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            OCULTO PLAY <Badge variant="secondary" className="ml-2">Master</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle global, fila de moderação e métricas. Killswitch desligado = invisível para usuários comuns.
          </p>
        </div>
      </header>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 w-full max-w-5xl">
          <TabsTrigger value="overview"><LayoutDashboard className="h-4 w-4 mr-1.5" /> Visão</TabsTrigger>
          <TabsTrigger value="config"><Settings2 className="h-4 w-4 mr-1.5" /> Config</TabsTrigger>
          <TabsTrigger value="content"><Film className="h-4 w-4 mr-1.5" /> Conteúdo</TabsTrigger>
          <TabsTrigger value="moderation"><Flag className="h-4 w-4 mr-1.5" /> Denúncias</TabsTrigger>
          <TabsTrigger value="auto"><EyeOff className="h-4 w-4 mr-1.5" /> Auto-ocultos</TabsTrigger>
          <TabsTrigger value="audio"><Music className="h-4 w-4 mr-1.5" /> Áudio/MP3</TabsTrigger>
          <TabsTrigger value="challenges"><Trophy className="h-4 w-4 mr-1.5" /> Desafios</TabsTrigger>
          <TabsTrigger value="today"><Star className="h-4 w-4 mr-1.5" /> Hoje</TabsTrigger>
          <TabsTrigger value="returnhooks"><RotateCcw className="h-4 w-4 mr-1.5" /> Volte p/ Ver</TabsTrigger>
          <TabsTrigger value="playlists"><ListMusic className="h-4 w-4 mr-1.5" /> Playlists</TabsTrigger>
          <TabsTrigger value="retention"><TrendingUp className="h-4 w-4 mr-1.5" /> Retenção</TabsTrigger>
          <TabsTrigger value="heatmap"><Calendar className="h-4 w-4 mr-1.5" /> Heatmap</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="h-4 w-4 mr-1.5" /> Métricas</TabsTrigger>
          <TabsTrigger value="conversion"><ArrowUpRight className="h-4 w-4 mr-1.5" /> Conversão</TabsTrigger>
          <TabsTrigger value="logs"><FileText className="h-4 w-4 mr-1.5" /> Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <AdminOcultoPlayOverviewPanel />
        </TabsContent>

        {/* CONFIG */}
        <TabsContent value="config" className="space-y-6 mt-4">
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
              onClick={() => navigate('/admin/play-share-editor')}
            >
              <Share2 className="h-4 w-4" />
              Configurar Página de Compartilhamento (Public)
            </Button>
          </div>
          <AdminOcultoPlayLaunchCard />


          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-5 flex gap-3 text-sm">
              <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
              <p>
                Tudo isolado em <code>oculto_play_*</code>. Não toca em Stories, Comunidades, Canais VIP, Radar, Aura ou Caixa Oculta.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Acesso global</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {KILLSWITCHES.map(({ key, label, help }) => (
                <div key={key} className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <Label htmlFor={key} className="font-medium">{label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{help}</p>
                  </div>
                  <Switch
                    id={key}
                    checked={!!draft[key]}
                    disabled={persistingRef.current.has(String(key))}
                    onCheckedChange={(v) => persistToggle(key, v as OcultoPlayConfig[typeof key])}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Seções do Play
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SECTIONS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor={key} className="text-sm">{label}</Label>
                  <Switch
                    id={key}
                    checked={!!draft[key]}
                    onCheckedChange={(v) => persistToggle(key, v as OcultoPlayConfig[typeof key])}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notas internas (Master)</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                rows={3}
                value={draft.notes ?? ''}
                onChange={(e) => setField('notes', e.target.value)}
                placeholder="Anotações de fase, decisões, datas previstas…"
              />
            </CardContent>
          </Card>

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => cfg && setDraft(cfg)} disabled={saving}>
              Reverter
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar alterações
            </Button>
          </div>
        </TabsContent>

        {/* HOJE NO OCULTO */}
        <TabsContent value="today" className="mt-4">
          <AdminOcultoPlayTodayPanel />
        </TabsContent>

        {/* PLAYLISTS (Etapa 23) */}
        <TabsContent value="playlists" className="mt-4">
          <AdminOcultoPlayPlaylistsPanel />
        </TabsContent>

        {/* MODERAÇÃO */}
        <TabsContent value="moderation" className="mt-4">
          <AdminOcultoPlayModerationPanel />
        </TabsContent>

        {/* AUTO-OCULTOS (Etapa 10) */}
        <TabsContent value="auto" className="mt-4">
          <AdminOcultoPlayAutoHiddenPanel />
        </TabsContent>

        {/* CONTEÚDO (PROMPT 3 — Etapa 6) */}
        <TabsContent value="content" className="mt-4">
          <AdminOcultoPlayContentPanel />
        </TabsContent>

        {/* ÁUDIO/MP3 (PROMPT 3 — Etapa 8) */}
        <TabsContent value="audio" className="mt-4 space-y-4">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-5 space-y-2 text-sm">
              <p className="font-medium flex items-center gap-2">
                <Music className="h-4 w-4 text-amber-500" /> Regra jurídica de áudio MP3
              </p>
              <p className="text-muted-foreground">
                Ao publicar um áudio, o usuário deve confirmar a declaração abaixo. O checkbox é obrigatório no fluxo de upload.
              </p>
              <blockquote className="border-l-2 border-amber-500/50 pl-3 italic text-xs text-muted-foreground">
                Ao publicar este áudio, você declara possuir os direitos de uso, reprodução e distribuição deste conteúdo, ou autorização expressa para publicá-lo no Oculto.
              </blockquote>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Controles rápidos</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>• Liga/desliga MP3 na aba <strong>Config → Seções do Play → Áudios autorais</strong>.</p>
              <p>• Denúncias de copyright entram na aba <strong>Denúncias</strong> com motivo "copyright".</p>
              <p>• Reincidentes são bloqueados via aba <strong>Auto-ocultos</strong>.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DESAFIOS (PROMPT 3 — Etapa 9) */}
        <TabsContent value="challenges" className="mt-4">
          <AdminOcultoPlayChallengesPanel />
        </TabsContent>

        {/* VOLTE PARA VER (PROMPT 3 — Etapa 12) */}
        <TabsContent value="returnhooks" className="mt-4">
          <AdminOcultoPlayReturnHooksPanel />
        </TabsContent>

        {/* LOGS (PROMPT 3 — Etapa 14) */}
        <TabsContent value="logs" className="mt-4">
          <AdminOcultoPlayLogsPanel />
        </TabsContent>

        {/* RETENÇÃO (Etapa 19) */}
        <TabsContent value="retention" className="mt-4">
          <AdminOcultoPlayRetentionPanel />
        </TabsContent>

        {/* HEATMAP (Etapa 20) */}
        <TabsContent value="heatmap" className="mt-4">
          <AdminOcultoPlayHeatmapPanel />
        </TabsContent>

        {/* STATS */}
        <TabsContent value="stats" className="mt-4">
          <StatsPanel />
        </TabsContent>

        {/* CONVERSÃO (Etapa 10 — RPC oculto_play_admin_metrics) */}
        <TabsContent value="conversion" className="mt-4">
          <AdminOcultoPlayEtapa10MetricsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatsPanel() {
  const { data, isLoading } = useOcultoPlayAdminStats();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const stats = (data ?? {}) as Record<string, number>;
  const cards: { key: string; label: string }[] = [
    { key: 'items_total', label: 'Itens (total)' },
    { key: 'items_published', label: 'Publicados' },
    { key: 'items_today', label: 'Hoje no Oculto' },
    { key: 'items_comeback', label: 'Volte para Ver' },
    { key: 'reports_pending', label: 'Denúncias pendentes' },
    { key: 'reports_total', label: 'Denúncias (total)' },
    { key: 'views_total', label: 'Views únicas' },
    { key: 'likes_total', label: 'Curtidas' },
    { key: 'saves_total', label: 'Saves' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {cards.map((c) => (
        <Card key={c.key}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-bold mt-1">{(stats[c.key] ?? 0).toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
