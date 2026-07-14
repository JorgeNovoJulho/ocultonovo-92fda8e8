import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink, FileText, Image as ImageIcon, Link2, Loader2, Music, Plus, Video } from 'lucide-react';
import { toast } from 'sonner';
import { TUTORIAL_SAVE_CATEGORIES } from '@/config/tutorialCategories';
import { useAuth } from '@/hooks/useAuth';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { useCreateTutorial, uploadTutorialMedia } from '@/hooks/useTutorials';

type MediaType = 'text' | 'image' | 'video' | 'audio' | 'link';

const MEDIA_OPTIONS: { value: MediaType; label: string; icon: typeof FileText }[] = [
  { value: 'text',  label: 'Apenas texto', icon: FileText },
  { value: 'image', label: 'Imagem',       icon: ImageIcon },
  { value: 'video', label: 'Vídeo',        icon: Video },
  { value: 'audio', label: 'Áudio',        icon: Music },
  { value: 'link',  label: 'Link externo', icon: Link2 },
];

interface Props {
  defaultCategory?: string;
}

export function TutorialEditor({ defaultCategory }: Props) {
  const { user } = useAuth();
  const { data: isMaster } = useIsMasterAdmin();
  const create = useCreateTutorial();
  const [open, setOpen] = useState(false);

  const [category, setCategory] = useState(defaultCategory || 'feed');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('text');
  const [file, setFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Preview URL para arquivo local selecionado.
  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);

  // Não renderiza nada para usuários que não são o master admin.
  if (!isMaster) return null;

  const reset = () => {
    setCategory(defaultCategory || 'feed');
    setTitle('');
    setDescription('');
    setMediaType('text');
    setFile(null);
    setLinkUrl('');
  };

  // Validação derivada — usada para inline errors e para desabilitar o botão.
  const errors = useMemo(() => {
    const e: Partial<Record<'category' | 'title' | 'description' | 'file' | 'link', string>> = {};
    if (!category) e.category = 'Selecione uma categoria.';
    if (!title.trim()) e.title = 'Informe um título.';
    if (mediaType === 'text' && !description.trim()) {
      e.description = 'O texto explicativo é obrigatório para o tipo "Apenas texto".';
    }
    if ((mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') && !file) {
      e.file = 'Selecione um arquivo compatível com o tipo de mídia.';
    }
    if (mediaType === 'link') {
      const v = linkUrl.trim();
      if (!v) e.link = 'Informe a URL.';
      else if (!/^https?:\/\/.+/i.test(v)) e.link = 'URL inválida. Use http(s)://...';
    }
    return e;
  }, [category, title, description, mediaType, file, linkUrl]);
  const hasErrors = Object.keys(errors).length > 0;

  const handleSubmit = async () => {
    if (!user) { toast.error('Faça login.'); return; }
    if (hasErrors) {
      toast.error(Object.values(errors)[0] as string);
      return;
    }

    setSubmitting(true);
    try {
      let mediaUrl: string | null = null;
      if (file && mediaType !== 'text' && mediaType !== 'link') {
        mediaUrl = await uploadTutorialMedia(file, user.id);
      }
      await create.mutateAsync({
        category,
        title: title.trim(),
        description: description.trim() || null,
        media_type: mediaType,
        media_url: mediaUrl,
        link_url: mediaType === 'link' ? linkUrl.trim() : null,
        author_id: user.id,
      });
      toast.success('Tutorial publicado.');
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao publicar.');
    } finally {
      setSubmitting(false);
    }
  };

  const acceptByType: Record<MediaType, string> = {
    image: 'image/*',
    video: 'video/*',
    audio: 'audio/*',
    text: '',
    link: '',
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Novo Tutorial
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Publicar novo tutorial</DialogTitle>
            <DialogDescription>
              Selecione uma categoria e adicione imagem, vídeo, áudio, link ou apenas texto.
              Aparecerá na guia escolhida e na guia <strong>Geral</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Categoria <span className="text-destructive">*</span></Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-invalid={!!errors.category}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {TUTORIAL_SAVE_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
            </div>

            <div className="space-y-1">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} aria-invalid={!!errors.title} />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>

            <div className="space-y-1">
              <Label>
                Descrição / Texto explicativo
                {mediaType === 'text' && <span className="text-destructive"> *</span>}
              </Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} aria-invalid={!!errors.description} />
              {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
            </div>

            <div className="space-y-1">
              <Label>Tipo de mídia <span className="text-destructive">*</span></Label>
              <Select value={mediaType} onValueChange={(v) => { setMediaType(v as MediaType); setFile(null); setLinkUrl(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEDIA_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {opt.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {(mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') && (
              <div className="space-y-1">
                <Label>Arquivo <span className="text-destructive">*</span></Label>
                <Input
                  type="file"
                  accept={acceptByType[mediaType]}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  aria-invalid={!!errors.file}
                />
                {errors.file && <p className="text-xs text-destructive">{errors.file}</p>}
              </div>
            )}

            {mediaType === 'link' && (
              <div className="space-y-1">
                <Label>URL do link <span className="text-destructive">*</span></Label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  aria-invalid={!!errors.link}
                />
                {errors.link && <p className="text-xs text-destructive">{errors.link}</p>}
              </div>
            )}

            {/* Preview ao vivo conforme o tipo de mídia */}
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Pré-visualização</Label>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 min-h-[80px]">
                {mediaType === 'text' && (
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">{title || 'Título do tutorial'}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {description || 'O texto explicativo aparecerá aqui.'}
                    </p>
                  </div>
                )}
                {mediaType === 'image' && (
                  filePreview
                    ? <img src={filePreview} alt="preview" className="max-h-64 w-auto rounded mx-auto" />
                    : <p className="text-xs text-muted-foreground text-center py-6">Selecione uma imagem para ver a pré-visualização.</p>
                )}
                {mediaType === 'video' && (
                  filePreview
                    ? <video src={filePreview} controls playsInline className="max-h-64 w-full rounded" />
                    : <p className="text-xs text-muted-foreground text-center py-6">Selecione um vídeo para ver a pré-visualização.</p>
                )}
                {mediaType === 'audio' && (
                  filePreview
                    ? <audio src={filePreview} controls className="w-full" />
                    : <p className="text-xs text-muted-foreground text-center py-6">Selecione um arquivo de áudio.</p>
                )}
                {mediaType === 'link' && (
                  linkUrl
                    ? (
                      <a href={linkUrl} target="_blank" rel="noreferrer"
                         className="inline-flex items-center gap-2 text-sm text-primary hover:underline break-all">
                        <ExternalLink className="h-4 w-4 shrink-0" /> {linkUrl}
                      </a>
                    )
                    : <p className="text-xs text-muted-foreground text-center py-6">Informe uma URL para ver a pré-visualização.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting || hasErrors}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Publicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
