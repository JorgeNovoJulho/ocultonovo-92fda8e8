/**
 * PlayTracksManager — Etapa 37
 *
 * UI para o autor do item adicionar / remover faixas .vtt (legendas, captions, capítulos).
 * Usado em modais de edição do item.
 */
import { useRef, useState } from 'react';
import { Loader2, Trash2, Upload, Captions, ListOrdered, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { usePlayTracks, usePlayTrackActions, type PlayTrackKind } from '@/hooks/useOcultoPlayTracks';
import { PlayChaptersManager } from '@/components/oculto-play/PlayChaptersManager';


interface Props {
  itemId: string;
}

const KIND_LABELS: Record<PlayTrackKind, string> = {
  subtitles: 'Legendas',
  captions: 'Captions (acessibilidade)',
  chapters: 'Capítulos',
};

export function PlayTracksManager({ itemId }: Props) {
  const { data: tracks = [], isLoading } = usePlayTracks(itemId);
  const { upsert, remove, uploadVtt } = usePlayTrackActions(itemId);

  const [kind, setKind] = useState<PlayTrackKind>('subtitles');
  const [lang, setLang] = useState('pt-BR');
  const [label, setLabel] = useState('Português');
  const [isDefault, setIsDefault] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadVtt(file);
      await upsert.mutateAsync({
        kind, lang, label: label || file.name.replace(/\.vtt$/i, ''),
        vtt_url: url, is_default: isDefault,
      });
      toast.success('Faixa adicionada');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      toast.error(err?.message ?? 'Falha ao enviar .vtt');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Captions className="h-4 w-4 text-fuchsia-500" />
        Legendas & Capítulos (.vtt)
      </div>

      {/* Form */}
      <div className="rounded-xl border border-border/40 bg-muted/30 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as PlayTrackKind)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="subtitles">Legendas</SelectItem>
              <SelectItem value="captions">Captions (acessibilidade)</SelectItem>
              <SelectItem value="chapters">Capítulos</SelectItem>
            </SelectContent>
          </Select>

          <Input
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            placeholder="pt-BR"
            className="h-9 text-xs"
          />
        </div>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Rótulo (ex.: Português)"
          className="h-9 text-xs"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Definir como padrão para este tipo
        </label>

        <input
          ref={fileRef}
          type="file"
          accept=".vtt,text/vtt"
          onChange={handleFile}
          className="hidden"
        />
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Enviando…</>
          ) : (
            <><Upload className="h-4 w-4 mr-1" /> Enviar arquivo .vtt</>
          )}
        </Button>
      </div>

      {/* Lista */}
      <div className="space-y-1">
        {isLoading && (
          <div className="text-xs text-muted-foreground">Carregando faixas…</div>
        )}
        {!isLoading && tracks.length === 0 && (
          <div className="text-xs text-muted-foreground">Nenhuma faixa enviada ainda.</div>
        )}
        {tracks.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-lg border border-border/30 bg-background px-2 py-1.5 text-xs"
          >
            {t.kind === 'chapters' ? (
              <ListOrdered className="h-3.5 w-3.5 text-fuchsia-500" />
            ) : (
              <Captions className="h-3.5 w-3.5 text-fuchsia-500" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {t.label} <span className="text-muted-foreground">· {t.lang}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {KIND_LABELS[t.kind]}
              </div>
            </div>
            {t.is_default && (
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive"
              onClick={() => {
                if (confirm('Remover esta faixa?')) remove.mutate(t.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Etapa 47 — Capítulos persistidos no banco */}
      <div className="mt-4 pt-4 border-t border-border/40">
        <PlayChaptersManager itemId={itemId} />
      </div>
    </div>
  );
}

