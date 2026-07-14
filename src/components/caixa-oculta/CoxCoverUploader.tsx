/**
 * CoxCoverUploader — upload de capa para o bucket cox-covers
 * com preview imediato, barra de progresso, mensagens claras
 * e botão de remover. Aceita também URL manual.
 */
import { useRef, useState, useEffect } from 'react';
import { Loader2, Upload, X, CheckCircle2, AlertCircle, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  value: string;
  onChange: (url: string) => void;
}

type Phase = 'idle' | 'uploading' | 'done' | 'error';

export function CoxCoverUploader({ value, onChange }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const blobRef = useRef<string | null>(null);
  const [preview, setPreview] = useState(value);
  const [phase, setPhase] = useState<Phase>('idle');
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState<string>('');

  useEffect(() => { setPreview(value); }, [value]);
  useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); }, []);

  const reset = () => {
    setPhase('idle');
    setPercent(0);
    setMessage('');
  };

  const remove = () => {
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
    setPreview('');
    onChange('');
    reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async (file: File) => {
    if (!user) { setPhase('error'); setMessage('Faça login para enviar capa.'); return; }
    if (!file.type.startsWith('image/')) { setPhase('error'); setMessage('O arquivo precisa ser uma imagem.'); return; }
    if (file.size > 5 * 1024 * 1024) { setPhase('error'); setMessage('Imagem maior que 5MB.'); return; }

    // Preview imediato
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    const blob = URL.createObjectURL(file);
    blobRef.current = blob;
    setPreview(blob);

    setPhase('uploading');
    setMessage('Enviando capa…');
    setPercent(8);

    // Progresso simulado (Supabase JS não emite progress real)
    const tick = window.setInterval(() => {
      setPercent((p) => (p < 88 ? p + Math.max(1, Math.round((90 - p) / 10)) : p));
    }, 180);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await (supabase as any).storage
        .from('cox-covers')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = (supabase as any).storage.from('cox-covers').getPublicUrl(path);
      window.clearInterval(tick);
      setPercent(100);
      setPhase('done');
      setMessage('Capa enviada com sucesso.');
      onChange(data.publicUrl);
      setPreview(data.publicUrl);
      if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
    } catch (e: any) {
      window.clearInterval(tick);
      setPhase('error');
      setMessage(e?.message ?? 'Falha no upload. Tente novamente.');
      setPercent(0);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Capa da Caixa Oculta</Label>

      <div className="rounded-lg border border-dashed p-3 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative h-20 w-32 shrink-0 rounded-md overflow-hidden bg-muted">
            {preview ? (
              <img loading="lazy" decoding="async" src={preview} alt="Pré-visualização da capa" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full grid place-items-center text-muted-foreground">
                <ImageIcon className="h-5 w-5" />
              </div>
            )}
            {preview && (
              <button
                type="button"
                onClick={remove}
                className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="Remover capa"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={phase === 'uploading'}
              onClick={() => inputRef.current?.click()}
            >
              {phase === 'uploading' ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando…</>
              ) : (
                <><Upload className="h-4 w-4 mr-1" />Escolher imagem</>
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground mt-1">JPG/PNG/WebP até 5MB. Recomendado 1200×630.</p>
          </div>
        </div>

        {phase === 'uploading' && (
          <div className="space-y-1">
            <Progress value={percent} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">{message} · {percent}%</p>
          </div>
        )}

        {phase === 'done' && (
          <p className="text-[11px] text-emerald-600 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />{message}
          </p>
        )}

        {phase === 'error' && (
          <p className="text-[11px] text-rose-600 inline-flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />{message}
          </p>
        )}

        <div className="pt-1">
          <Label className="text-[11px] text-muted-foreground">Ou cole uma URL pública</Label>
          <Input
            value={value}
            onChange={(e) => { onChange(e.target.value); reset(); }}
            placeholder="https://…"
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}

export default CoxCoverUploader;
