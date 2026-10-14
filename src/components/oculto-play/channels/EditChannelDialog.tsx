/**
 * Personalizar canal (só o dono): nome, endereço, descrição, foto, capa e
 * cor de destaque. Imagens vão para o bucket do Play já comprimidas pelo
 * navegador (máx. 1600 px) para não pesar no celular.
 */
import { useEffect, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { uploadOcultoPlayFile } from '@/hooks/useOcultoPlayContent';
import {
  channelErrorMessage,
  slugifyChannel,
  useUpdatePlayChannel,
  type PlayChannel,
} from '@/hooks/usePlayChannels';

export const CHANNEL_ACCENTS = ['#ec4899', '#a855f7', '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#f5f5f4'];

async function shrinkImage(file: File, maxSide: number): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && file.size < 600_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export function EditChannelDialog({ channel, open, onOpenChange, onSaved }: {
  channel: PlayChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (channel: PlayChannel) => void;
}) {
  const { user } = useAuth();
  const update = useUpdatePlayChannel();
  const [name, setName] = useState(channel.name);
  const [slug, setSlug] = useState(channel.slug);
  const [description, setDescription] = useState(channel.description ?? '');
  const [accent, setAccent] = useState(channel.accent_color ?? '');
  const [avatarUrl, setAvatarUrl] = useState(channel.avatar_url ?? '');
  const [bannerUrl, setBannerUrl] = useState(channel.banner_url ?? '');
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(channel.name); setSlug(channel.slug); setDescription(channel.description ?? '');
    setAccent(channel.accent_color ?? ''); setAvatarUrl(channel.avatar_url ?? ''); setBannerUrl(channel.banner_url ?? '');
  }, [open, channel]);

  const nextSlugChange = channel.slug_changed_at
    ? new Date(new Date(channel.slug_changed_at).getTime() + 30 * 86_400_000)
    : null;
  const slugLocked = !!nextSlugChange && nextSlugChange.getTime() > Date.now();

  const pickImage = async (which: 'avatar' | 'banner', f: File | undefined) => {
    if (!f || !user?.id) return;
    if (!f.type.startsWith('image/')) { toast.error('Escolha uma imagem.'); return; }
    setUploading(which);
    try {
      const small = await shrinkImage(f, which === 'avatar' ? 512 : 1600);
      const { publicUrl } = await uploadOcultoPlayFile(small, user.id, 'image');
      if (which === 'avatar') setAvatarUrl(publicUrl); else setBannerUrl(publicUrl);
    } catch (e) {
      toast.error(channelErrorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    try {
      const ch = await update.mutateAsync({
        id: channel.id,
        name: name.trim(),
        slug: slug !== channel.slug ? slug : undefined,
        description,
        avatar_url: avatarUrl,
        banner_url: bannerUrl,
        accent_color: accent,
      });
      toast.success('Canal atualizado.');
      onOpenChange(false);
      onSaved?.(ch);
    } catch (e) {
      toast.error(channelErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!update.isPending && !uploading) onOpenChange(v); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Personalizar canal</DialogTitle>
          <DialogDescription>O que você mudar aqui aparece para todos que visitarem o canal.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative h-24 overflow-hidden rounded-xl bg-muted/40">
            {bannerUrl && <img src={bannerUrl} alt="" className="h-full w-full object-cover" />}
            <label className="absolute right-2 bottom-2 inline-flex cursor-pointer items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
              {uploading === 'banner' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              Capa
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage('banner', e.target.files?.[0])} />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted/40">
              {avatarUrl && <img src={avatarUrl} alt="" className="h-full w-full object-cover" />}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold">
              {uploading === 'avatar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              Foto do canal
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage('avatar', e.target.files?.[0])} />
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Endereço</label>
            <div className={cn('flex items-center rounded-md border border-input bg-background pl-3 text-sm', slugLocked && 'opacity-60')}>
              <span className="shrink-0 text-muted-foreground">/play/c/</span>
              <input
                value={slug}
                disabled={slugLocked}
                onChange={(e) => setSlug(slugifyChannel(e.target.value))}
                className="h-10 min-w-0 flex-1 bg-transparent px-1 outline-none"
                aria-label="Endereço do canal"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {slugLocked && nextSlugChange
                ? `Próxima troca de endereço liberada em ${nextSlugChange.toLocaleDateString('pt-BR')}.`
                : 'Pode ser trocado no máximo a cada 30 dias.'}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Descrição</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 1000))} rows={4} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Cor de destaque</label>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccent(c)}
                  aria-label={`Cor ${c}`}
                  className={cn('h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-background', accent === c ? 'ring-foreground' : 'ring-transparent')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <Button className="w-full" onClick={save} disabled={update.isPending || !!uploading || name.trim().length < 2}>
            {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
