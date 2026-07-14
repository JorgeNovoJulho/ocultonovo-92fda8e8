import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  BarChart3,
  Plus,
  Trash2,
  Coins,
  Loader2,
  Image as ImageIcon,
  X,
  Camera,
} from 'lucide-react';
import { useCreatePoll } from '@/hooks/usePolls';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

interface CreatePollModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PollOptionDraft {
  text: string;
  image_url: string | null;
  uploading?: boolean;
}

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024; // 2.5MB cap por opção (perf)

export function CreatePollModal({ open, onOpenChange }: CreatePollModalProps) {
  const createPoll = useCreatePoll();
  const { user } = useAuth();

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<PollOptionDraft[]>([
    { text: '', image_url: null },
    { text: '', image_url: null },
  ]);
  const [entryCost, setEntryCost] = useState(0);
  const [allowMultipleVotes, setAllowMultipleVotes] = useState(false);
  const [showResultsBeforeVote, setShowResultsBeforeVote] = useState(false);
  const [closesAt, setClosesAt] = useState('');
  const [contentText, setContentText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');

  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  const resetForm = () => {
    setQuestion('');
    setOptions([
      { text: '', image_url: null },
      { text: '', image_url: null },
    ]);
    setEntryCost(0);
    setAllowMultipleVotes(false);
    setShowResultsBeforeVote(false);
    setClosesAt('');
    setContentText('');
    setMediaUrl('');
  };

  const addOption = () => {
    if (options.length < 4) {
      setOptions([...options, { text: '', image_url: null }]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text: value };
      return next;
    });
  };

  const setOptionImage = (index: number, url: string | null) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], image_url: url, uploading: false };
      return next;
    });
  };

  const setOptionUploading = (index: number, uploading: boolean) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], uploading };
      return next;
    });
  };

  const handleImagePick = useCallback(
    async (index: number, file: File | null) => {
      if (!file) return;
      if (!user?.id) {
        toast.error('Faça login para enviar imagens');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Selecione uma imagem');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error('Imagem muito grande (máx. 2,5MB)');
        return;
      }

      try {
        setOptionUploading(index, true);
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${user.id}/polls/${Date.now()}-${index}.${ext}`;
        const { error } = await supabase.storage
          .from('media')
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
          });
        if (error) throw error;
        const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
        setOptionImage(index, pub.publicUrl);
      } catch (e: any) {
        setOptionUploading(index, false);
        toast.error(e?.message || 'Falha no upload');
      }
    },
    [user?.id]
  );

  const handleSubmit = async () => {
    if (!question.trim()) {
      toast.error('Digite uma pergunta para a enquete');
      return;
    }

    const validOptions = options.filter((o) => o.text.trim());
    if (validOptions.length < 2) {
      toast.error('Adicione pelo menos 2 opções');
      return;
    }

    if (entryCost > 0 && entryCost < 0.5) {
      toast.error('Custo mínimo é R$ 0,50');
      return;
    }

    try {
      await createPoll.mutateAsync({
        question: question.trim(),
        options: validOptions.map((o) => ({
          text: o.text.trim(),
          image_url: o.image_url,
        })),
        entry_cost: entryCost,
        allow_multiple_votes: allowMultipleVotes,
        show_results_before_vote: showResultsBeforeVote,
        // datetime-local fornece "YYYY-MM-DDTHH:mm" sem timezone — tratamos como
        // horário local do usuário e convertemos para ISO UTC antes de persistir.
        closes_at: closesAt ? new Date(closesAt).toISOString() : null,
        content_text: contentText.trim() || undefined,
        media_url: mediaUrl.trim() || undefined,
      });

      resetForm();
      onOpenChange(false);
    } catch {
      // handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          p-0 gap-0 border-border bg-background
          w-[calc(100vw-1rem)] sm:max-w-lg
          max-h-[92dvh] sm:max-h-[90vh]
          flex flex-col overflow-hidden
          rounded-2xl
        "
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-2 shrink-0 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            Criar Enquete
          </DialogTitle>
        </DialogHeader>

        {/* Conteúdo rolável com scrollbar invisível e momentum mobile */}
        <div
          className="
            flex-1 min-h-0 overflow-y-auto scrollbar-hide
            px-4 sm:px-6 py-4
            [-webkit-overflow-scrolling:touch] overscroll-contain
          "
          style={{ contain: 'content' }}
        >
          <div className="space-y-5">
            {/* Pergunta */}
            <div className="space-y-2">
              <Label htmlFor="question">Pergunta *</Label>
              <Textarea
                id="question"
                placeholder="Qual roupa devo usar hoje?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="resize-none"
                rows={2}
              />
            </div>

            {/* Opções com imagem */}
            <div className="space-y-2">
              <Label>Opções * (2-4)</Label>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border/60 bg-card/40 p-2 space-y-2"
                  >
                    <div className="flex gap-2 items-start">
                      {/* Thumb / botão de upload */}
                      <button
                        type="button"
                        onClick={() => fileRefs.current[index]?.click()}
                        className="
                          relative shrink-0 w-12 h-12 rounded-md overflow-hidden
                          border border-border/60 bg-muted/50
                          flex items-center justify-center
                          active:opacity-80 transition-opacity
                        "
                        aria-label={`Imagem da opção ${index + 1}`}
                      >
                        {option.uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : option.image_url ? (
                          <img
                            src={option.image_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Camera className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      <Input
                        placeholder={`Opção ${index + 1}`}
                        value={option.text}
                        onChange={(e) => updateOption(index, e.target.value)}
                        className="flex-1"
                      />

                      {options.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOption(index)}
                          className="shrink-0"
                          aria-label="Remover opção"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}

                      <input
                        ref={(el) => (fileRefs.current[index] = el)}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          handleImagePick(index, f);
                          e.currentTarget.value = '';
                        }}
                      />
                    </div>

                    {option.image_url && !option.uploading && (
                      <button
                        type="button"
                        onClick={() => setOptionImage(index, null)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Remover imagem
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {options.length < 4 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOption}
                  className="w-full gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Opção
                </Button>
              )}
            </div>

            {/* Custo */}
            <div className="space-y-2">
              <Label htmlFor="entry-cost" className="flex items-center gap-2">
                <Coins className="h-4 w-4" />
                Custo por Voto (créditos)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="entry-cost"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  value={entryCost}
                  onChange={(e) =>
                    setEntryCost(parseFloat(e.target.value) || 0)
                  }
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  {entryCost === 0
                    ? 'Gratuito'
                    : `R$ ${entryCost.toFixed(2)}`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Você receberá 90% do valor de cada voto (10% taxa da plataforma)
              </p>
            </div>

            {/* Configurações */}
            <div className="space-y-4 rounded-lg border border-border/60 p-3 sm:p-4">
              <h4 className="font-medium text-sm">Configurações</h4>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor="multiple-votes">Permitir múltiplos votos</Label>
                  <p className="text-xs text-muted-foreground">
                    Mesma pessoa pode votar várias vezes
                  </p>
                </div>
                <Switch
                  id="multiple-votes"
                  checked={allowMultipleVotes}
                  onCheckedChange={setAllowMultipleVotes}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor="show-results">
                    Mostrar resultados antes de votar
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Usuários veem porcentagens antes de votar
                  </p>
                </div>
                <Switch
                  id="show-results"
                  checked={showResultsBeforeVote}
                  onCheckedChange={setShowResultsBeforeVote}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="closes-at">Encerramento (opcional)</Label>
                <Input
                  id="closes-at"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="content">Descrição adicional (opcional)</Label>
              <Textarea
                id="content"
                placeholder="Adicione contexto ou detalhes..."
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                className="resize-none"
                rows={2}
              />
            </div>

            {/* Mídia geral */}
            <div className="space-y-2">
              <Label htmlFor="media" className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                URL da Mídia (opcional)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="media"
                  placeholder="https://..."
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                />
                {mediaUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setMediaUrl('')}
                    aria-label="Limpar URL"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {entryCost > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 sm:p-4">
                <h4 className="font-medium text-sm mb-2">
                  💰 Potencial de Ganhos
                </h4>
                <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                  <div>
                    <p className="text-base sm:text-lg font-bold text-primary">
                      R$ {(entryCost * 10 * 0.9).toFixed(2)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      10 votos
                    </p>
                  </div>
                  <div>
                    <p className="text-base sm:text-lg font-bold text-primary">
                      R$ {(entryCost * 50 * 0.9).toFixed(2)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      50 votos
                    </p>
                  </div>
                  <div>
                    <p className="text-base sm:text-lg font-bold text-primary">
                      R$ {(entryCost * 100 * 0.9).toFixed(2)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      100 votos
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ações fixas no rodapé (sem precisar rolar) */}
        <div
          className="
            shrink-0 flex gap-2 px-4 sm:px-6 py-3
            border-t border-border/40 bg-background
            pb-[max(env(safe-area-inset-bottom),0.75rem)]
          "
        >
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createPoll.isPending || options.some((o) => o.uploading)}
            className="flex-1 gap-2"
          >
            {createPoll.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <BarChart3 className="h-4 w-4" />
                Publicar Enquete
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
