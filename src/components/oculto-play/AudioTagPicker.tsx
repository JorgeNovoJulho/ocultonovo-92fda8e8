/**
 * AudioTagPicker — pickup multi-seleção com criação ad-hoc.
 * Usa o catálogo global oculto_play_audio_tags (gênero ou IA).
 */
import { useMemo, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useOcultoPlayAudioTags,
  useUpsertAudioTag,
  type AudioTag,
  type AudioTagKind,
} from '@/hooks/useOcultoPlayAudioTags';
import { toast } from 'sonner';

interface Props {
  kind: AudioTagKind;
  selected: AudioTag[];
  onChange: (next: AudioTag[]) => void;
  placeholder?: string;
  /** false = só permite escolher entre os existentes (sem criar) */
  allowCreate?: boolean;
}

export function AudioTagPicker({
  kind, selected, onChange, placeholder, allowCreate = true,
}: Props) {
  const { data: tags = [], isLoading } = useOcultoPlayAudioTags(kind);
  const upsert = useUpsertAudioTag();
  const [input, setInput] = useState('');

  const selectedIds = useMemo(() => new Set(selected.map((t) => t.id)), [selected]);

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, input]);

  const toggle = (tag: AudioTag) => {
    if (selectedIds.has(tag.id)) onChange(selected.filter((t) => t.id !== tag.id));
    else onChange([...selected, tag]);
  };

  const exists = filtered.some((t) => t.name.toLowerCase() === input.trim().toLowerCase());
  const canCreate = allowCreate && input.trim().length >= 2 && !exists && !upsert.isPending;

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      const created = await upsert.mutateAsync({ name: input.trim(), kind });
      if (!selectedIds.has(created.id)) onChange([...selected, created]);
      setInput('');
      toast.success('Tag adicionada ao catálogo.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao criar tag.');
    }
  };

  return (
    <div className="space-y-2">
      {/* Selecionadas */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t)}
              className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/25 border border-fuchsia-500/60 text-fuchsia-50 text-[11px] px-2 py-0.5"
            >
              {t.name}
              <X className="h-3 w-3 opacity-70" />
            </button>
          ))}
        </div>
      )}

      {/* Input + criar */}
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
          }}
          placeholder={placeholder ?? (kind === 'genre' ? 'Buscar ou adicionar estilo…' : 'Buscar ou adicionar IA…')}
          className="flex-1 h-8 rounded-md bg-background border border-border/50 px-2 text-xs outline-none focus:border-fuchsia-500/60"
          maxLength={40}
        />
        {allowCreate && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className={cn(
              'h-8 px-2 rounded-md text-[11px] font-medium border transition-colors flex items-center gap-1',
              canCreate
                ? 'bg-fuchsia-500/20 border-fuchsia-500/60 text-fuchsia-100 hover:bg-fuchsia-500/30'
                : 'bg-muted/30 border-border/40 text-muted-foreground cursor-not-allowed',
            )}
            title="Adicionar nova tag ao catálogo"
          >
            {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Nova
          </button>
        )}
      </div>

      {/* Lista filtrada */}
      <div className="max-h-32 overflow-y-auto rounded-md border border-border/40 bg-card/40 p-1.5 [scrollbar-width:thin]">
        {isLoading ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground py-2 px-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando catálogo…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-muted-foreground py-2 px-1">
            {input ? 'Nada encontrado. Clique em "Nova" para criar.' : 'Catálogo vazio.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {filtered.map((t) => {
              const isSel = selectedIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t)}
                  className={cn(
                    'rounded-full text-[11px] px-2 py-0.5 border transition-colors',
                    isSel
                      ? 'bg-fuchsia-500/30 border-fuchsia-500/60 text-fuchsia-50'
                      : 'bg-background/60 border-border/40 text-foreground/85 hover:border-fuchsia-500/40',
                  )}
                >
                  {t.name}
                  {t.is_preset && <span className="ml-1 opacity-50 text-[9px]">•</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
