/**
 * Admin Master — Comunidades Ocultas.
 * Painel completo em abas: Visão Geral, Configurações, Comunidades,
 * Categorias, Denúncias, Moderação, Métricas, Logs, Oficiais.
 * Protegido por MasterAdminRoute em App.tsx.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useCommunitySettings, useCommunityTrending } from '@/hooks/useCommunities';
import { AdminCommunityCategoriesCard } from '@/components/admin/AdminCommunityCategoriesCard';
import { AdminCommunityAuditLogsCard } from '@/components/admin/AdminCommunityAuditLogsCard';
import { Users, Star, Ban, CheckCircle2, Pause, Flame, Link2, Copy, ShieldCheck, Clock, Activity } from 'lucide-react';


export default function AdminCommunitiesPage() {
  return (
    <div className="px-3 sm:px-4 py-4 max-w-6xl mx-auto pb-20 space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-fuchsia-400" /> Comunidades Ocultas — Admin Master
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Configurações globais, moderação, métricas e logs. Rota também acessível em <code>/admin/comunidades-ocultas</code>.
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-card border border-border p-1">
          <TabsTrigger value="overview" className="text-xs">Visão Geral</TabsTrigger>
          <TabsTrigger value="settings" className="text-xs">Configurações</TabsTrigger>
          <TabsTrigger value="communities" className="text-xs">Comunidades</TabsTrigger>
          <TabsTrigger value="categories" className="text-xs">Categorias</TabsTrigger>
          <TabsTrigger value="reports" className="text-xs">Denúncias</TabsTrigger>
          <TabsTrigger value="moderation" className="text-xs">Moderação</TabsTrigger>
          <TabsTrigger value="metrics" className="text-xs">Métricas</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">Logs</TabsTrigger>
          <TabsTrigger value="official" className="text-xs">Oficiais</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <MetricsStrip />
          <PendingApprovalList />
          <TrendingCard />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-4">
          <SettingsCard />
        </TabsContent>

        <TabsContent value="communities" className="space-y-4 mt-4">
          <PendingApprovalList />
          <CommunitiesList />
          <InvitesAdminCard />
        </TabsContent>

        <TabsContent value="categories" className="space-y-4 mt-4">
          <AdminCommunityCategoriesCard />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4 mt-4">
          <ReportsList />
        </TabsContent>

        <TabsContent value="moderation" className="space-y-4 mt-4">
          <PendingApprovalList />
          <ReportsList />
          <CommunitiesList />
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4 mt-4">
          <MetricsStrip />
          <TrendingCard />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <AdminCommunityAuditLogsCard />
        </TabsContent>

        <TabsContent value="official" className="space-y-4 mt-4">
          <CommunitiesList officialOnly />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricsStrip() {
  const { data } = useQuery({
    queryKey: ['admin_oculto_communities_metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_communities')
        .select('status,members_count,topics_count');
      if (error) throw error;
      const rows = (data as any[]) ?? [];
      return {
        total: rows.length,
        active: rows.filter(r => r.status === 'active').length,
        pending: rows.filter(r => r.status === 'pending_approval').length,
        paused: rows.filter(r => r.status === 'paused').length,
        banned: rows.filter(r => r.status === 'banned').length,
        members: rows.reduce((s, r) => s + (r.members_count || 0), 0),
        topics: rows.reduce((s, r) => s + (r.topics_count || 0), 0),
      };
    },
    staleTime: 30_000,
  });
  const items = [
    { label: 'Total', value: data?.total ?? 0, icon: Users, color: 'text-fuchsia-400' },
    { label: 'Ativas', value: data?.active ?? 0, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Aprovação', value: data?.pending ?? 0, icon: Clock, color: 'text-amber-400' },
    { label: 'Pausadas', value: data?.paused ?? 0, icon: Pause, color: 'text-amber-300' },
    { label: 'Banidas', value: data?.banned ?? 0, icon: Ban, color: 'text-rose-400' },
    { label: 'Membros', value: data?.members ?? 0, icon: Activity, color: 'text-sky-400' },
    { label: 'Tópicos', value: data?.topics ?? 0, icon: Flame, color: 'text-orange-400' },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-2.5 text-center">
          <Icon className={`h-4 w-4 mx-auto ${color}`} />
          <p className="text-base font-bold mt-1">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}

function PendingApprovalList() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ['admin_oculto_communities_pending_approval'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_communities')
        .select('id,title,slug,description,visibility,is_adult,members_count,created_at,owner_id')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    staleTime: 15_000,
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase
        .from('oculto_communities')
        .update({ status: approve ? 'active' : 'banned' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      toast.success(vars.approve ? 'Comunidade aprovada.' : 'Comunidade recusada.');
      qc.invalidateQueries({ queryKey: ['admin_oculto_communities_pending_approval'] });
      qc.invalidateQueries({ queryKey: ['admin_oculto_communities'] });
      qc.invalidateQueries({ queryKey: ['admin_oculto_communities_metrics'] });
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
    },
    onError: () => toast.error('Erro ao atualizar.'),
  });

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <Clock className="h-4 w-4 text-amber-400" /> Aguardando aprovação ({rows.length})
      </h2>
      <div className="space-y-2 max-h-[40vh] overflow-y-auto">
        {rows.map((c) => (
          <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg border border-border bg-card">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-semibold truncate">{c.title}</p>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">{c.visibility}</Badge>
                {c.is_adult && <Badge className="bg-rose-600/30 text-rose-200 text-[9px] h-4 px-1.5">+18</Badge>}
              </div>
              <p className="text-[10px] text-muted-foreground">/{c.slug} · {new Date(c.created_at).toLocaleString('pt-BR')}</p>
              {c.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700" onClick={() => decide.mutate({ id: c.id, approve: true })} disabled={decide.isPending}>
                Aprovar
              </Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => { if (confirm('Recusar e banir esta comunidade?')) decide.mutate({ id: c.id, approve: false }); }} disabled={decide.isPending}>
                Recusar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvitesAdminCard() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin_oculto_community_invites_global'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_invites_admin_list', { _limit: 200 });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const revoke = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.rpc('community_invite_revoke', { _invite: inviteId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Convite revogado.');
      qc.invalidateQueries({ queryKey: ['admin_oculto_community_invites_global'] });
    },
    onError: () => toast.error('Erro ao revogar.'),
  });

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <Link2 className="h-4 w-4 text-fuchsia-400" /> Convites globais ({rows.length})
      </h2>
      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhum convite criado.</p>
      )}
      <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
        {rows.map((inv: any) => (
          <div key={inv.id} className="flex items-center gap-2 p-2 rounded-lg border border-border text-xs">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{inv.community_title} <span className="text-muted-foreground">/{inv.community_slug}</span></p>
              <p className="text-[10px] text-muted-foreground truncate">
                código <code>{inv.code}</code> · usos {inv.uses_count}/{inv.max_uses ?? '∞'} ·{' '}
                {inv.is_active ? 'ativo' : 'revogado'}
                {inv.expires_at ? ` · expira ${new Date(inv.expires_at).toLocaleDateString('pt-BR')}` : ''}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              title="Copiar link"
              onClick={() => {
                navigator.clipboard.writeText(`${baseUrl}/comunidades/invite/${inv.code}`);
                toast.success('Link copiado');
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {inv.is_active && (
              <Button size="icon" variant="ghost" title="Revogar"
                onClick={() => { if (confirm('Revogar este convite?')) revoke.mutate(inv.id); }}>
                <Ban className="h-3.5 w-3.5 text-rose-400" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendingCard() {
  const { data: rows = [], isLoading } = useCommunityTrending(10);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <Flame className="h-4 w-4 text-orange-400" /> Em alta (últimos 7 dias)
      </h2>
      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">Sem atividade recente.</p>
      )}
      <div className="space-y-1.5">
        {rows.map((c: any, idx: number) => (
          <div key={c.community_id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/40">
            <span className="text-xs font-bold text-muted-foreground w-5 text-center">{idx + 1}</span>
            <div
              className="h-7 w-7 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
              style={{ backgroundColor: c.accent_color || '#a855f7' }}
            >
              {c.avatar_url ? (
                <img src={c.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <Users className="h-3.5 w-3.5 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.title}</p>
              <p className="text-[10px] text-muted-foreground">
                {c.topics_7d} tópicos · {c.replies_7d} respostas · {c.members_count} membros
              </p>
            </div>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">/{c.slug}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}


function SettingsCard() {
  const { data: s, refetch } = useCommunitySettings();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<any>(null);
  const current = draft ?? s;

  const save = useMutation({
    mutationFn: async () => {
      if (!current) return;
      const { id, created_at, updated_at, ...rest } = current as any;
      const { error } = await supabase.from('oculto_community_settings').update(rest).eq('id', (s as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configurações salvas.');
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['oculto_community_settings'] });
      refetch();
    },
    onError: () => toast.error('Erro ao salvar.'),
  });

  if (!s) return <div className="text-sm text-muted-foreground">Carregando configurações…</div>;

  const set = (patch: any) => setDraft({ ...(current as any), ...patch });

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">Configurações globais</h2>

      <ToggleRow label="Recurso ativo" value={!!current?.enabled} onChange={(v) => set({ enabled: v })} />
      <ToggleRow label="Free pode entrar em comunidades" value={!!current?.allow_free_join} onChange={(v) => set({ allow_free_join: v })} />
      <ToggleRow label="Free pode criar comunidades" value={!!current?.allow_free_create} onChange={(v) => set({ allow_free_create: v })} />
      <ToggleRow label="Premium pode criar" value={!!current?.allow_premium_create} onChange={(v) => set({ allow_premium_create: v })} />
      <ToggleRow label="VIP pode criar" value={!!current?.allow_vip_create} onChange={(v) => set({ allow_vip_create: v })} />
      <ToggleRow label="Aprovação master para novas comunidades" value={!!current?.require_admin_approval_for_new_communities} onChange={(v) => set({ require_admin_approval_for_new_communities: v })} />

      <div className="grid grid-cols-2 gap-2">
        <NumberRow label="Premium · máx comunidades" value={current?.premium_max_communities ?? 5} onChange={(v) => set({ premium_max_communities: v })} />
        <NumberRow label="VIP · máx comunidades" value={current?.vip_max_communities ?? 5} onChange={(v) => set({ vip_max_communities: v })} />
        <NumberRow label="Tópicos/dia" value={current?.max_topics_per_day ?? 10} onChange={(v) => set({ max_topics_per_day: v })} />
        <NumberRow label="Respostas/dia" value={current?.max_replies_per_day ?? 50} onChange={(v) => set({ max_replies_per_day: v })} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ToggleRow label="Permite privadas" value={!!current?.allow_private_communities} onChange={(v) => set({ allow_private_communities: v })} />
        <ToggleRow label="Permite Premium-only" value={!!current?.allow_premium_only_communities} onChange={(v) => set({ allow_premium_only_communities: v })} />
        <ToggleRow label="Permite VIP-only" value={!!current?.allow_vip_only_communities} onChange={(v) => set({ allow_vip_only_communities: v })} />
        <ToggleRow label="Permite Criadores-exclusiva" value={!!current?.allow_creator_exclusive_communities} onChange={(v) => set({ allow_creator_exclusive_communities: v })} />
        <ToggleRow label="Imagens" value={!!current?.allow_images} onChange={(v) => set({ allow_images: v })} />
        <ToggleRow label="Vídeos" value={!!current?.allow_videos} onChange={(v) => set({ allow_videos: v })} />
        <ToggleRow label="Áudio" value={!!current?.allow_audio} onChange={(v) => set({ allow_audio: v })} />
        <ToggleRow label="Moderação automática" value={!!current?.moderation_enabled} onChange={(v) => set({ moderation_enabled: v })} />
      </div>

      <Button onClick={() => save.mutate()} disabled={!draft || save.isPending} className="w-full">
        {save.isPending ? 'Salvando…' : 'Salvar configurações'}
      </Button>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <Label className="text-xs">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="text-xs">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-8 mt-1" />
    </div>
  );
}

function CommunitiesList({ officialOnly = false }: { officialOnly?: boolean } = {}) {
  const qc = useQueryClient();
  const { data: rows = [], refetch } = useQuery({
    queryKey: ['admin_oculto_communities', officialOnly ? 'official' : 'all'],
    queryFn: async () => {
      let q = supabase
        .from('oculto_communities')
        .select('id,title,slug,status,visibility,is_featured,is_official,members_count,topics_count,created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (officialOnly) q = q.eq('is_official', true);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from('oculto_communities').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_oculto_communities'] });
      qc.invalidateQueries({ queryKey: ['admin_oculto_communities_metrics'] });
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
      refetch();
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3">
        {officialOnly ? `Comunidades oficiais (${rows.length})` : `Todas as comunidades (${rows.length})`}
      </h2>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-semibold truncate">{c.title}</p>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">{c.status}</Badge>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">{c.visibility}</Badge>
                {c.is_featured && <Badge className="bg-amber-600/30 text-amber-200 text-[9px] h-4 px-1.5">DESTAQUE</Badge>}
                {c.is_official && <Badge className="bg-purple-600/30 text-purple-200 text-[9px] h-4 px-1.5">OFICIAL</Badge>}
              </div>
              <p className="text-[10px] text-muted-foreground">/{c.slug} · {c.members_count} membros · {c.topics_count} tópicos</p>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" title="Destacar" onClick={() => update.mutate({ id: c.id, patch: { is_featured: !c.is_featured } })}>
                <Star className={`h-4 w-4 ${c.is_featured ? 'text-amber-400 fill-amber-400' : ''}`} />
              </Button>
              <Button size="icon" variant="ghost" title="Marcar oficial" onClick={() => update.mutate({ id: c.id, patch: { is_official: !c.is_official } })}>
                <ShieldCheck className={`h-4 w-4 ${c.is_official ? 'text-purple-400 fill-purple-400/30' : ''}`} />
              </Button>
              {c.status === 'active' ? (
                <>
                  <Button size="icon" variant="ghost" title="Pausar" onClick={() => update.mutate({ id: c.id, patch: { status: 'paused' } })}>
                    <Pause className="h-4 w-4 text-amber-400" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Banir" onClick={() => update.mutate({ id: c.id, patch: { status: 'banned' } })}>
                    <Ban className="h-4 w-4 text-rose-400" />
                  </Button>
                </>
              ) : (
                <Button size="icon" variant="ghost" title="Reativar" onClick={() => update.mutate({ id: c.id, patch: { status: 'active' } })}>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma comunidade ainda.</p>}
      </div>
    </div>
  );
}

function ReportsList() {
  const qc = useQueryClient();
  const { data: reports = [] } = useQuery({
    queryKey: ['admin_oculto_community_reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_community_reports')
        .select('*')
        .in('status', ['pending', 'reviewing'])
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const { error } = await supabase
        .from('oculto_community_reports')
        .update({ status: 'resolved', action_taken: action, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin_oculto_community_reports'] }),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3">Denúncias pendentes ({reports.length})</h2>
      {reports.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma denúncia pendente.</p>}
      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="p-2 rounded-lg border border-border text-xs">
            <p><b>Motivo:</b> {r.reason}</p>
            {r.details && <p className="text-muted-foreground">{r.details}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">
              {r.community_id && <>comunidade: {r.community_id.slice(0, 8)} · </>}
              {r.topic_id && <>tópico: {r.topic_id.slice(0, 8)} · </>}
              {r.reply_id && <>resposta: {r.reply_id.slice(0, 8)}</>}
            </p>
            <div className="flex gap-1 mt-2">
              <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: r.id, action: 'dismissed' })}>Descartar</Button>
              <Button size="sm" onClick={() => resolve.mutate({ id: r.id, action: 'content_removed' })}>Resolvido</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
