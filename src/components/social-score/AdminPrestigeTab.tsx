import { useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { usePrestigeLevels, type PrestigeLevel } from '@/hooks/usePrestige';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Save, Plus, Trash2, Loader2, Crown } from 'lucide-react';

const ICON_OPTIONS = ['sparkles', 'eye', 'flame', 'crown', 'gem', 'star'];

interface Draft {
  id: string | null;
  rank: number;
  name: string;
  min_xp: number;
  description: string;
  badge_icon: string;
  glow_color: string;
  rewards_text: string;
  is_active: boolean;
}

function emptyDraft(rank: number): Draft {
  return {
    id: null, rank, name: '', min_xp: 0, description: '',
    badge_icon: 'sparkles', glow_color: '270 70% 60%',
    rewards_text: '{}', is_active: true,
  };
}

function toDraft(l: PrestigeLevel): Draft {
  return {
    id: l.id, rank: l.rank, name: l.name, min_xp: l.min_xp,
    description: l.description ?? '',
    badge_icon: l.badge_icon, glow_color: l.glow_color,
    rewards_text: JSON.stringify(l.rewards ?? {}, null, 2),
    is_active: l.is_active,
  };
}

export function AdminPrestigeTab() {
  const { levels, loading, reload } = usePrestigeLevels();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newDraft, setNewDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const get = (l: PrestigeLevel): Draft => drafts[l.id] ?? toDraft(l);
  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((s) => ({ ...s, [id]: { ...(s[id] ?? toDraft(levels.find(l => l.id === id)!)), ...patch } }));

  async function save(d: Draft) {
    setBusy(true);
    try {
      let rewards: any = {};
      try { rewards = JSON.parse(d.rewards_text || '{}'); } catch { toast.error('Rewards JSON inválido'); setBusy(false); return; }
      const { error } = await (supabase as any).rpc('social_admin_set_prestige', {
        p_id: d.id,
        p_rank: d.rank,
        p_name: d.name,
        p_min_xp: d.min_xp,
        p_description: d.description || null,
        p_badge_icon: d.badge_icon,
        p_glow_color: d.glow_color,
        p_visual_style: {},
        p_rewards: rewards,
        p_is_active: d.is_active,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Nível salvo');
      setNewDraft(null);
      await reload();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm('Remover este nível de prestígio?')) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc('social_admin_delete_prestige', { p_id: id });
      if (error) { toast.error(error.message); return; }
      toast.success('Removido');
      await reload();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5" /> Níveis de Prestígio</CardTitle>
          <CardDescription>
            Camada emocional acima do Score Social. Configure nomes, faixas de XP, ícones, cor de glow e recompensas (JSON).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}

          {levels.map((l) => {
            const d = get(l);
            return (
              <div key={l.id} className="border rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                  <div>
                    <Label className="text-[11px]">Rank</Label>
                    <Input type="number" value={d.rank} onChange={(e) => set(l.id, { rank: parseInt(e.target.value || '0') })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-[11px]">Nome</Label>
                    <Input value={d.name} onChange={(e) => set(l.id, { name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-[11px]">XP mínimo</Label>
                    <Input type="number" value={d.min_xp} onChange={(e) => set(l.id, { min_xp: parseInt(e.target.value || '0') })} />
                  </div>
                  <div>
                    <Label className="text-[11px]">Ícone</Label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      value={d.badge_icon}
                      onChange={(e) => set(l.id, { badge_icon: e.target.value })}
                    >
                      {ICON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Glow (HSL)</Label>
                    <Input value={d.glow_color} onChange={(e) => set(l.id, { glow_color: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px]">Descrição</Label>
                  <Input value={d.description} onChange={(e) => set(l.id, { description: e.target.value })} />
                </div>
                <div>
                  <Label className="text-[11px]">Recompensas (JSON)</Label>
                  <Textarea
                    rows={3}
                    className="font-mono text-xs"
                    value={d.rewards_text}
                    onChange={(e) => set(l.id, { rewards_text: e.target.value })}
                    placeholder='{"discount_sub": 10, "boost_radar": 1.2}'
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={d.is_active} onCheckedChange={(v) => set(l.id, { is_active: v })} />
                    <span className="text-xs text-muted-foreground">Ativo</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={() => remove(l.id)} disabled={busy}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                    </Button>
                    <Button size="sm" onClick={() => save(d)} disabled={busy}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {newDraft ? (
            <div className="border rounded-lg p-3 space-y-2 border-dashed">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <div>
                  <Label className="text-[11px]">Rank</Label>
                  <Input type="number" value={newDraft.rank} onChange={(e) => setNewDraft({ ...newDraft, rank: parseInt(e.target.value || '0') })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[11px]">Nome</Label>
                  <Input value={newDraft.name} onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-[11px]">XP mínimo</Label>
                  <Input type="number" value={newDraft.min_xp} onChange={(e) => setNewDraft({ ...newDraft, min_xp: parseInt(e.target.value || '0') })} />
                </div>
                <div>
                  <Label className="text-[11px]">Ícone</Label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={newDraft.badge_icon}
                    onChange={(e) => setNewDraft({ ...newDraft, badge_icon: e.target.value })}
                  >
                    {ICON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-[11px]">Glow (HSL)</Label>
                  <Input value={newDraft.glow_color} onChange={(e) => setNewDraft({ ...newDraft, glow_color: e.target.value })} />
                </div>
              </div>
              <Input placeholder="Descrição" value={newDraft.description} onChange={(e) => setNewDraft({ ...newDraft, description: e.target.value })} />
              <Textarea rows={3} className="font-mono text-xs" value={newDraft.rewards_text}
                onChange={(e) => setNewDraft({ ...newDraft, rewards_text: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setNewDraft(null)}>Cancelar</Button>
                <Button size="sm" onClick={() => save(newDraft)} disabled={busy || !newDraft.name}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Criar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setNewDraft(emptyDraft((levels.at(-1)?.rank ?? 0) + 1))}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Novo nível de prestígio
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
