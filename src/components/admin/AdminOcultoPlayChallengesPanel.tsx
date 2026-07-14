/**
 * AdminOcultoPlayChallengesPanel — Desafios (PROMPT 3 — Etapa 9)
 * CRUD básico de desafios semanais.
 */
import { useEffect, useState } from 'react';
import { Loader2, Plus, Star, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

type Challenge = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  xp_reward: number;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
};

export function AdminOcultoPlayChallengesPanel() {
  const [items, setItems] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', starts_at: '', ends_at: '', xp_reward: 50 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('oculto_play_challenges' as never)
      .select('id, title, description, starts_at, ends_at, xp_reward, is_active, is_featured, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Challenge[]);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title.trim()) { toast.error('Título é obrigatório'); return; }
    setSaving(true);
    const { error } = await supabase.from('oculto_play_challenges' as never).insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      xp_reward: Number(form.xp_reward) || 0,
      is_active: true,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Desafio criado');
    setOpen(false);
    setForm({ title: '', description: '', starts_at: '', ends_at: '', xp_reward: 50 });
    load();
  };

  const toggle = async (c: Challenge, patch: Partial<Challenge>) => {
    const { error } = await supabase.from('oculto_play_challenges' as never).update(patch as never).eq('id', c.id);
    if (error) { toast.error(error.message); return; }
    setItems(prev => prev.map(i => i.id === c.id ? { ...i, ...patch } : i));
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Novo desafio</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo desafio</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Desafio Meme Oculto" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Início</Label>
                  <Input type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>XP de recompensa</Label>
                <Input type="number" value={form.xp_reward} onChange={e => setForm(f => ({ ...f, xp_reward: Number(e.target.value) }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={create} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum desafio criado.</p>
      ) : items.map(c => (
        <Card key={c.id}>
          <CardContent className="p-3 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {c.is_featured && <Badge className="text-[10px] bg-amber-500/90">Destaque</Badge>}
                {!c.is_active && <Badge variant="secondary" className="text-[10px]">Pausado</Badge>}
                <Badge variant="outline" className="text-[10px]">+{c.xp_reward} XP</Badge>
              </div>
              <p className="text-sm font-medium truncate mt-1">{c.title}</p>
              {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
              <p className="text-[10px] text-muted-foreground mt-1">
                {c.starts_at && new Date(c.starts_at).toLocaleString('pt-BR')}
                {c.ends_at && ` → ${new Date(c.ends_at).toLocaleString('pt-BR')}`}
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" variant="outline" onClick={() => toggle(c, { is_featured: !c.is_featured })} title="Destacar">
                <Star className={`h-3.5 w-3.5 ${c.is_featured ? 'fill-amber-500 text-amber-500' : ''}`} />
              </Button>
              <Button size="sm" variant="outline" onClick={() => toggle(c, { is_active: !c.is_active })} title={c.is_active ? 'Pausar' : 'Ativar'}>
                {c.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
