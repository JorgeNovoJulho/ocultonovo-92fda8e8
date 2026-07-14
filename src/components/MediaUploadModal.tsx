import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Upload, 
  X, 
  Image as ImageIcon, 
  Video, 
  Pencil, 
  Globe, 
  Users, 
  Crown,
  Share2,
  Copy,
  Link,
  Trash2,
  AlertCircle,
  ArrowUp,
  Play,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaUploadWithLimits } from '@/hooks/useMediaUploadWithLimits';
import { AdvancedMediaEditor } from './AdvancedMediaEditor';
import { VideoCoverPicker } from './VideoCoverPicker';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { getCanonicalAuthorIds } from '@/lib/postAuthorResolver';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { MAX_VIDEO_DOWNLOAD_PRICE, validatePaidVideoDownloadPrice } from '@/lib/paidVideoDownload';

interface MediaUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (info: { uploadedTypes: Array<'image' | 'video'>; privacyLevel: PrivacyLevel }) => void;
  /** Pré-seleciona a privacidade ao abrir (ex.: 'hidden' a partir do card Invisível). */
  initialPrivacy?: PrivacyLevel;
}

interface PendingFile {
  file: File;
  preview: string;
  edited?: Blob;
  editedPreview?: string;
  coverBlob?: Blob;
  coverPreview?: string;
  error?: string;
  suggestUpgrade?: boolean;
}

type PrivacyLevel = 'public' | 'friends' | 'vip' | 'hidden';

export function MediaUploadModal({ open, onOpenChange, onSuccess, initialPrivacy }: MediaUploadModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { validateFile, uploadMedia, uploading, progress, limits, supportedFormats } = useMediaUploadWithLimits();
  
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(initialPrivacy ?? 'public');
  const [allowSharing, setAllowSharing] = useState(true);
  const [paidVideoDownload, setPaidVideoDownload] = useState(false);
  const [videoDownloadPrice, setVideoDownloadPrice] = useState('');
  const [caption, setCaption] = useState('');
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Aplica a privacidade inicial sempre que o modal abre.
  useEffect(() => {
    if (open && initialPrivacy) setPrivacyLevel(initialPrivacy);
  }, [open, initialPrivacy]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
    e.target.value = '';
  }, []);

  const processFiles = (files: File[]) => {
    const newPendingFiles: PendingFile[] = files.map(file => {
      const validation = validateFile(file);
      return {
        file,
        preview: URL.createObjectURL(file),
        error: validation.valid ? undefined : validation.error,
        suggestUpgrade: validation.suggestUpgrade,
      };
    });
    setPendingFiles(prev => [...prev, ...newPendingFiles]);
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      if (newFiles[index].editedPreview) {
        URL.revokeObjectURL(newFiles[index].editedPreview);
      }
      if (newFiles[index].coverPreview) URL.revokeObjectURL(newFiles[index].coverPreview!);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleVideoCoverSelected = useCallback((index: number, url: string, blob: Blob) => {
    setPendingFiles(prev => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      if (current.coverPreview && current.coverPreview !== url) URL.revokeObjectURL(current.coverPreview);
      next[index] = { ...current, coverBlob: blob, coverPreview: url };
      return next;
    });
  }, []);

  const openEditor = (index: number) => {
    const file = pendingFiles[index];
    if (file.file.type.startsWith('image/')) {
      setEditingFile(file.file);
      setEditingIndex(index);
    } else {
      toast.info('Edição de vídeo disponível em breve');
    }
  };

  const handleEditorSave = (blob: Blob) => {
    if (editingIndex !== null) {
      const editedPreview = URL.createObjectURL(blob);
      setPendingFiles(prev => {
        const newFiles = [...prev];
        if (newFiles[editingIndex].editedPreview) {
          URL.revokeObjectURL(newFiles[editingIndex].editedPreview);
        }
        newFiles[editingIndex] = {
          ...newFiles[editingIndex],
          edited: blob,
          editedPreview,
          error: undefined, // Clear error after editing
        };
        return newFiles;
      });
    }
    setEditingFile(null);
    setEditingIndex(null);
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return;
    }

    const validFiles = pendingFiles.filter(f => !f.error);
    if (validFiles.length === 0) {
      toast.error('Nenhum arquivo válido para upload');
      return;
    }
    const parsedPrice = paidVideoDownload ? validatePaidVideoDownloadPrice(videoDownloadPrice) : null;
    if (parsedPrice && !parsedPrice.success) {
      toast.error(parsedPrice.error.errors[0]?.message || 'Informe um valor válido em R$');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress({ current: 0, total: validFiles.length });

    try {
      // Get profile ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        throw new Error('Perfil não encontrado');
      }

      const uploadedTypes: Array<'image' | 'video'> = [];

      for (let i = 0; i < validFiles.length; i++) {
        const pf = validFiles[i];
        setUploadProgress({ current: i + 1, total: validFiles.length });

        // Upload the file (edited version if available)
        const fileToUpload = pf.edited || pf.file;
        const result = await uploadMedia(
          fileToUpload,
          'posts',
          pf.file.name
        );

        let thumbnailUrl: string | null = null;
        if (result.mediaType === 'video' && pf.coverBlob) {
          const coverResult = await uploadMedia(
            pf.coverBlob,
            'thumbnails',
            `${pf.file.name.replace(/\.[^.]+$/, '')}-capa.webp`
          );
          thumbnailUrl = coverResult.url;
        }

        const isPaidVideo = result.mediaType === 'video' && paidVideoDownload;
        const parsedVideoPrice = parsedPrice?.success ? parsedPrice.data : 0;

        // Create post entry
        const { authorProfileId, creatorId } = await getCanonicalAuthorIds(user!.id);
        const { error: postError } = await supabase
          .from('posts')
          .insert({
            author_id: authorProfileId,
            creator_id: creatorId,
            content_text: caption || null,
            media_url: result.url,
            media_type: result.mediaType,
            thumbnail_url: thumbnailUrl,
            privacy_level: privacyLevel,
            allow_sharing: allowSharing,
            file_size_bytes: result.fileSize,
            file_type: result.fileType,
            original_filename: result.fileName,
            is_locked: privacyLevel === 'vip' || privacyLevel === 'hidden',
            is_paid: isPaidVideo && parsedVideoPrice > 0,
            paid_price: isPaidVideo && parsedVideoPrice > 0 ? parsedVideoPrice : null,
          });

        if (postError) {
          console.error('Error creating post:', postError);
          toast.error(`Erro ao salvar ${pf.file.name}`);
        } else {
          uploadedTypes.push(result.mediaType === 'video' ? 'video' : 'image');
        }
      }

      toast.success(`${validFiles.length} mídia(s) enviada(s) com sucesso!`);

      // Cleanup
      pendingFiles.forEach(f => {
        URL.revokeObjectURL(f.preview);
        if (f.editedPreview) URL.revokeObjectURL(f.editedPreview);
        if (f.coverPreview) URL.revokeObjectURL(f.coverPreview);
      });
      const submittedPrivacy = privacyLevel;
      setPendingFiles([]);
      setCaption('');
      setPrivacyLevel('public');
      setAllowSharing(true);
      setPaidVideoDownload(false);
      setVideoDownloadPrice('');

      // Invalidate queries (force immediate refetch of media lists)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['creator-media'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['my-posts'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['my-vault-posts'], refetchType: 'all' }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['creator-media'], type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['my-posts'], type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['my-vault-posts'], type: 'all' }),
      ]);

      onSuccess?.({ uploadedTypes, privacyLevel: submittedPrivacy });
      onOpenChange(false);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro no upload');
    } finally {
      setIsSubmitting(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const hasErrors = pendingFiles.some(f => f.error);
  const validCount = pendingFiles.filter(f => !f.error).length;
  const invalidPaidVideoPrice = paidVideoDownload && !validatePaidVideoDownloadPrice(videoDownloadPrice).success;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Enviar Mídias
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="upload" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="privacy">Privacidade</TabsTrigger>
              <TabsTrigger value="caption">Legenda</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="flex-1 overflow-auto space-y-4">
              {/* Limits Info */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Seu plano:</span>
                  <span className="font-medium capitalize">{limits.planType}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Limite de imagens:</span>
                  <span>{limits.imageLimit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Limite de vídeos:</span>
                  <span>{limits.videoLimit}</span>
                </div>
                {limits.canUpgradeForLargerVideos && (
                  <p className="text-xs text-primary flex items-center gap-1 pt-1">
                    <ArrowUp className="h-3 w-3" />
                    Faça upgrade para VIP e envie vídeos de até 1GB!
                  </p>
                )}
              </div>

              {/* Drop Zone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                  "hover:border-primary hover:bg-primary/5"
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById('media-upload-input')?.click()}
              >
                <input
                  id="media-upload-input"
                  type="file"
                  multiple
                  accept={[
                    ...supportedFormats.image.map(f => `image/${f}`),
                    ...supportedFormats.video.map(f => `video/${f}`),
                  ].join(',')}
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-2">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    <Video className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="font-medium">Arraste arquivos aqui ou clique para selecionar</p>
                  <p className="text-sm text-muted-foreground">
                    Imagens e vídeos em qualquer formato
                  </p>
                </div>
              </div>

              {/* Pending Files Grid */}
              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {pendingFiles.length} arquivo(s) selecionado(s)
                    </span>
                    {hasErrors && (
                      <span className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {pendingFiles.filter(f => f.error).length} com erro
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 max-h-[300px] overflow-auto">
                    {pendingFiles.map((pf, index) => (
                      <div
                        key={index}
                        className={cn(
                          "relative aspect-square rounded-lg overflow-hidden bg-muted group",
                          pf.error && "ring-2 ring-destructive"
                        )}
                      >
                        {pf.file.type.startsWith('image/') ? (
                          <img loading="lazy" decoding="async"
                            src={pf.editedPreview || pf.preview}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <>
                            {pf.coverPreview ? (
                              <img loading="lazy" decoding="async" src={pf.coverPreview} alt="Capa escolhida do vídeo" className="w-full h-full object-cover" />
                            ) : (
                              <video src={pf.preview} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-background/20 pointer-events-none">
                              <div className="h-10 w-10 rounded-full bg-background/80 flex items-center justify-center">
                                <Play className="h-5 w-5 text-foreground ml-0.5" />
                              </div>
                            </div>
                          </>
                        )}

                        {/* Overlay with actions */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          {pf.file.type.startsWith('image/') && !pf.error && (
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditor(index);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(index);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Video indicator */}
                        {pf.file.type.startsWith('video/') && (
                          <div className="absolute top-2 left-2 bg-black/70 rounded px-1.5 py-0.5 text-xs text-white flex items-center gap-1">
                            <Video className="h-3 w-3" />
                            {pf.coverPreview ? 'Capa pronta' : 'Vídeo'}
                          </div>
                        )}

                        {/* Edited badge */}
                        {pf.edited && (
                          <div className="absolute top-2 right-2 bg-primary rounded px-1.5 py-0.5 text-xs text-primary-foreground">
                            Editado
                          </div>
                        )}

                        {/* Error badge */}
                        {pf.error && (
                          <div className="absolute bottom-0 left-0 right-0 bg-destructive/90 p-2">
                            <p className="text-xs text-destructive-foreground line-clamp-2">
                              {pf.error}
                            </p>
                            {pf.suggestUpgrade && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="mt-1 h-6 text-xs w-full"
                              >
                                <Crown className="h-3 w-3 mr-1" />
                                Fazer Upgrade
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {pendingFiles.map((pf, index) => pf.file.type.startsWith('video/') && !pf.error ? (
                      <VideoCoverPicker
                        key={`${pf.file.name}-${index}`}
                        videoFile={pf.file}
                        onCoverSelected={(url, blob) => handleVideoCoverSelected(index, url, blob)}
                        selectedCoverUrl={pf.coverPreview}
                      />
                    ) : null)}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="privacy" className="space-y-4">
              <div className="space-y-4">
                <Label>Quem pode ver este conteúdo?</Label>
                <RadioGroup
                  value={privacyLevel}
                  onValueChange={(v) => setPrivacyLevel(v as PrivacyLevel)}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="public" id="public" />
                    <Label htmlFor="public" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-green-500" />
                        <span className="font-medium">Público</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Visível para todos os usuários</p>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="friends" id="friends" />
                    <Label htmlFor="friends" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Somente Seguidores</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Apenas quem segue você</p>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="vip" id="vip" />
                    <Label htmlFor="vip" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-500" />
                        <span className="font-medium">Conteúdo VIP</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Exclusivo para assinantes VIP</p>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="hidden" id="hidden" />
                    <Label htmlFor="hidden" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <EyeOff className="h-4 w-4 text-slate-300" />
                        <span className="font-medium">🔒 Invisível a Todos</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Fica apenas no seu acervo pessoal — não aparece em nenhum feed</p>
                    </Label>
                  </div>
                </RadioGroup>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label>Permitir compartilhamento</Label>
                      <p className="text-sm text-muted-foreground">
                        Gerar link para compartilhar
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={allowSharing}
                    onCheckedChange={setAllowSharing}
                  />
                </div>

                {allowSharing && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Link className="h-4 w-4" />
                      <span>O link de compartilhamento será gerado após o upload</span>
                    </div>
                  </div>
                )}

                {pendingFiles.some(f => f.file.type.startsWith('video/') && !f.error) && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label>Download pago do vídeo</Label>
                        <p className="text-sm text-muted-foreground">Somente usuários VIP poderão liberar o download após pagar.</p>
                      </div>
                      <Switch checked={paidVideoDownload} onCheckedChange={setPaidVideoDownload} />
                    </div>
                    {paidVideoDownload && (
                      <div className="space-y-2">
                        <Label htmlFor="video-download-price">Valor do download (R$)</Label>
                        <Input
                          id="video-download-price"
                          inputMode="decimal"
                          placeholder="Ex: 19,90"
                          value={videoDownloadPrice}
                          onChange={(e) => setVideoDownloadPrice(e.target.value.replace(/[^0-9,.]/g, ''))}
                        />
                        <p className="text-xs text-muted-foreground">Permitido de R$ 1,00 até R$ {MAX_VIDEO_DOWNLOAD_PRICE.toFixed(2).replace('.', ',')}.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="caption" className="space-y-4">
              <div className="space-y-2">
                <Label>Legenda (opcional)</Label>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Escreva uma legenda para suas mídias..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Esta legenda será aplicada a todas as mídias enviadas neste lote.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Upload Progress */}
          {isSubmitting && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-sm">
                <span>Enviando...</span>
                <span>{uploadProgress.current}/{uploadProgress.total}</span>
              </div>
              <Progress value={(uploadProgress.current / uploadProgress.total) * 100} />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={validCount === 0 || isSubmitting || invalidPaidVideoPrice}
            >
              {isSubmitting ? (
                'Enviando...'
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar {validCount > 0 ? `(${validCount})` : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Editor Modal */}
      <AdvancedMediaEditor
        open={!!editingFile}
        onOpenChange={() => {
          setEditingFile(null);
          setEditingIndex(null);
        }}
        imageFile={editingFile}
        onSave={handleEditorSave}
      />
    </>
  );
}
