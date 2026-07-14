/**
 * PlayChaptersManager — Etapa 47
 *
 * Gerenciador de capítulos para o dono do item:
 * - Lista capítulos persistidos (RPC oculto_play_list_chapters).
 * - Adiciona/edita/remove via useOcultoPlayChapterActions.
 * - Tipos: intro, recap, chapter, highlight, outro.
 * - Permite capturar tempo atual (em mm:ss) via input livre.
 *
 * Usado dentro de modais de edição do item, como PlayTracksManager.
 * Sem dependências pesadas (sem dnd-kit nem motion).
 */
import { useEffect, useMemo, useState } from 'react';
import { ListOrdered, Plus, Trash2, Save, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOcultoPlayChapterActions } from '@/hooks/useOcultoPlayChapterActions';
import type { PlayDbChapter } from '@/hooks/useOcultoPlayChapters';

interface Props { itemId: string }

const KIND_OPTIONS: Array<{ value: PlayDbChapter['kind']; label: string }> = [
  { value: 'intro',     label: 'Intro' },
  { value: 'recap',     label: 'Recap' },
  { value: 'chapter',   label: 'Capítulo' },
  { value: 'highlight', label: 'Destaque' },
  { value: 'outro',     label: 'Encerramento' },
];

function fmtMmSs(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseMmSs(v: string): number | null {
  const trimmed = (v ?? '').trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const m = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
  if (!m) return null;
  const mins = Number(m[1]);
  const secs = Number(m[2]);
  const ms = m[3] ? Number(`0.${m[3]}`) : 0;
  if (secs >= 60) return null;
  return mins * 60 + secs + ms;
}

export function PlayChaptersManager({ itemId }: Props) {
  const { list, upsert, remove, busy } = useOcultoPlayChapterActions(itemId);
  const [items, setItems] = useState<PlayDbChapter[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    start: '',
    end: '',
    label: '',
    kind: 'chapter' as PlayDbChapter['kind'],
  });

  const reload = async () => {
    setLoading(true);
    const data = await list();
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [itemId]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ start: '', end: '', label: '', kind: 'chapter' });
  };

  const startEdit = (c: PlayDbChapter) => {
    setEditingId(c.id);
    setForm({
      start: fmtMmSs(c.start),
      end: c.end != null ? fmtMmSs(c.end) : '',
      label: c.label,
      kind: c.kind,
    });
  };

  const handleSave = async () => {
    const start = parseMmSs(form.start);
    if (start == null) return;
    const end = form.end.trim() ? parseMmSs(form.end) : null;
    if (form.end.trim() && end == null) return;
    if (end != null && end <= start) return;
    await upsert({
      id: editingId,
      position_seconds: start,
      end_seconds: end,
      label: form.label.trim(),
      kind: form.kind,
    });
    resetForm();
    await reload();
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remover este capítulo?')) return;
    const ok = await remove(id);
    if (ok) await reload();
  };

  const canSave = useMemo(() => {
    const start = parseMmSs(form.start);
    if (start == null) return false;
    if (form.end.trim()) {
      const end = parseMmSs(form.end);
      if (end == null || end <= start) return false;
    }
    if ((form.kind === 'intro' || form.kind === 'recap') && !form.end.trim()) return false;
    return true;
  }, [form]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-fuchsia-300">
        <ListOrdered className="h-4 w-4" />
        Capítulos & marcadores
      </div>

      {/* Lista */}
      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
        {loading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            <Loader2 className="h-4 w-4 animate-spin inline" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Nenhum capítulo. Adicione abaixo.
          </div>
        ) : (
          items.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-card/50 px-2 py-1.5 text-xs"
            >
              <span className="font-mono text-fuchsia-300 shrink-0">
                {fmtMmSs(c.start)}
                {c.end != null ? `–${fmtMmSs(c.end)}` : ''}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                {KIND_OPTIONS.find(k => k.value === c.kind)?.label ?? c.kind}
              </span>
              <span className="flex-1 truncate">{c.label || '—'}</span>
              <button
                onClick={() => startEdit(c)}
                className="text-muted-foreground hover:text-foreground"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleRemove(c.id)}
                className="text-muted-foreground hover:text-destructive"
                title="Remover"
                disabled={busy}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Form */}
      <div className="rounded-md border border-border/60 bg-card/40 p-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold">
            {editingId ? 'Editar capítulo' : 'Novo capítulo'}
          </div>
          {editingId && (
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Início (mm:ss)"
            value={form.start}
            onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Fim (mm:ss) — opcional"
            value={form.end}
            onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
            className="h-8 text-xs"
          />
        </div>

        <div className="grid grid-cols-[1fr_140px] gap-2">
          <Input
            placeholder="Rótulo (ex.: Apresentação)"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            className="h-8 text-xs"
          />
          <Select value={form.kind} onValueChange={(v: PlayDbChapter['kind']) => setForm(f => ({ ...f, kind: v }))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            {form.kind === 'intro' || form.kind === 'recap'
              ? 'Intro/Recap exigem fim — usado pelo botão "Pular".'
              : 'Fim é opcional para capítulos normais.'}
          </p>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave || busy}
            className="h-7 text-xs gap-1"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : editingId ? <Save className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {editingId ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
