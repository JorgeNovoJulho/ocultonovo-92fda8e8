import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useCreateBroadcast, useRecipientCount, AudienceType } from '@/hooks/useBroadcasts';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import { 
  Megaphone, 
  Lock, 
  Users, 
  UserCheck, 
  UserX, 
  X, 
  Upload,
  Eye,
  Loader2,
  DollarSign,
  Calendar as CalendarIcon,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addHours, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useBetaGuard } from '@/hooks/useBetaGuard';
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

interface CreateBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateBroadcastModal({ isOpen, onClose }: CreateBroadcastModalProps) {
  const [content, setContent] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [isPpv, setIsPpv] = useState(false);
  const [ppvPrice, setPpvPrice] = useState('');
  const [audienceType, setAudienceType] = useState<AudienceType>('all_followers');
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [scheduledHour, setScheduledHour] = useState('12');
  const [scheduledMinute, setScheduledMinute] = useState('00');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createBroadcast = useCreateBroadcast();
  const { data: recipientCount, isLoading: countLoading } = useRecipientCount(audienceType);
  const { isLocked: ppvBetaLocked, lockedLabel: ppvBetaLockedLabel } = useBetaGuard('paid_content');

  // Força PPV off enquanto travado no Beta
  useEffect(() => { if (ppvBetaLocked && isPpv) setIsPpv(false); }, [ppvBetaLocked, isPpv]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setMediaFile(null);
      setMediaPreview(null);
      setMediaType(null);
      setIsPpv(false);
      setPpvPrice('');
      setAudienceType('all_followers');
      setShowPreview(false);
      setIsScheduled(false);
      setScheduledDate(undefined);
      setScheduledHour('12');
      setScheduledMinute('00');
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    if (file.type.startsWith('image/')) {
      setMediaType('image');
    } else if (file.type.startsWith('video/')) {
      setMediaType('video');
    } else {
      toast.error('Apenas imagens e vídeos são permitidos');
      return;
    }

    // Check file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Limite: 50MB');
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const removeMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadMedia = async (): Promise<string | null> => {
    if (!mediaFile) return null;

    setIsUploading(true);
    try {
      const fileExt = mediaFile.name.split('.').pop();
      const fileName = `broadcast-${Date.now()}.${fileExt}`;
      const filePath = `broadcasts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(filePath, mediaFile);

      if (uploadError) throw uploadError;

      return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/post-media/${filePath}`;
    } catch (error: any) {
      toast.error(`Erro no upload: ${error.message}`);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!content && !mediaFile) {
      toast.error('Adicione uma mensagem ou mídia');
      return;
    }

    if (isPpv && !mediaFile) {
      toast.error('Conteúdo pago requer mídia');
      return;
    }

    if (isPpv && (!ppvPrice || parseFloat(ppvPrice) < 1)) {
      toast.error('Preço mínimo: R$ 1,00');
      return;
    }

    // Validate scheduling
    if (isScheduled) {
      if (!scheduledDate) {
        toast.error('Selecione uma data para agendar');
        return;
      }
      const scheduledDateTime = setMinutes(
        setHours(scheduledDate, parseInt(scheduledHour)),
        parseInt(scheduledMinute)
      );
      if (scheduledDateTime <= new Date()) {
        toast.error('A data de agendamento deve ser no futuro');
        return;
      }
    }

    let mediaUrl: string | undefined;
    if (mediaFile) {
      const url = await uploadMedia();
      if (!url) return;
      mediaUrl = url;
    }

    // Build scheduled date if scheduling
    let scheduledFor: Date | undefined;
    if (isScheduled && scheduledDate) {
      scheduledFor = setMinutes(
        setHours(scheduledDate, parseInt(scheduledHour)),
        parseInt(scheduledMinute)
      );
    }

    createBroadcast.mutate(
      {
        content: content || undefined,
        mediaUrl,
        mediaType: mediaType || undefined,
        isPpv,
        ppvPrice: isPpv ? parseFloat(ppvPrice) : undefined,
        audienceType,
        isScheduled,
        scheduledFor,
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  const audienceOptions = [
    { 
      value: 'all_followers' as AudienceType, 
      label: 'Todos os Seguidores', 
      icon: Users,
      description: 'Alcance máximo'
    },
    { 
      value: 'active_subscribers' as AudienceType, 
      label: 'Assinantes Ativos', 
      icon: UserCheck,
      description: 'Usuários pagantes'
    },
    { 
      value: 'expired_subscribers' as AudienceType, 
      label: 'Assinantes Expirados', 
      icon: UserX,
      description: 'Reconquista'
    },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Nova Mensagem em Massa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Audience Selector */}
          <div className="space-y-2">
            <Label>Audiência</Label>
            <Select value={audienceType} onValueChange={(v) => setAudienceType(v as AudienceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {audienceOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="h-4 w-4" />
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground">({opt.description})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {countLoading ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Contando...
                </span>
              ) : (
                <span className="font-medium text-primary">{recipientCount || 0} destinatários</span>
              )}
            </p>
          </div>

          {/* Message Content */}
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              placeholder="Escreva sua mensagem..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{content.length}/500</p>
          </div>

          {/* Media Upload */}
          <div className="space-y-2">
            <Label>Mídia (opcional)</Label>
            
            {mediaPreview ? (
              <div className="relative rounded-lg overflow-hidden border bg-muted">
                {mediaType === 'image' ? (
                  <img loading="lazy" decoding="async" 
                    src={mediaPreview} 
                    alt="Preview" 
                    className="w-full max-h-48 object-cover"
                  />
                ) : (
                  <video preload="none" 
                    src={mediaPreview} 
                    className="w-full max-h-48 object-cover"
                    controls
                  />
                )}
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={removeMedia}
                 aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Clique para adicionar foto ou vídeo
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Máximo 50MB
                </p>
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* PPV Toggle */}
          {mediaFile && (
            <div className="space-y-4 p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  <Label htmlFor="ppv-toggle">Conteúdo Pago (PPV)</Label>
                </div>
                <Switch
                  id="ppv-toggle"
                  checked={isPpv}
                  onCheckedChange={setIsPpv}
                  disabled={ppvBetaLocked}
                />
              </div>

              {ppvBetaLocked && (
                <p className="text-[11px] text-amber-300/90 flex items-center gap-1">
                  <Lock className="h-3 w-3" /> {ppvBetaLockedLabel} — durante o Beta, broadcasts não podem ser pagos.
                </p>
              )}

              {isPpv && (
                <div className="space-y-2">
                  <Label>Preço para desbloquear</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="10.00"
                      value={ppvPrice}
                      onChange={(e) => setPpvPrice(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Você recebe 80% ({formatCurrency(parseFloat(ppvPrice || '0') * 0.8)})
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Scheduling Toggle */}
          <div className="space-y-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-400" />
                <Label htmlFor="schedule-toggle">Agendar Envio</Label>
              </div>
              <Switch
                id="schedule-toggle"
                checked={isScheduled}
                onCheckedChange={setIsScheduled}
              />
            </div>

            {isScheduled && (
              <div className="space-y-3">
                <Label>Data e Hora do Envio</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal",
                          !scheduledDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scheduledDate ? format(scheduledDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduledDate}
                        onSelect={setScheduledDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  
                  <Select value={scheduledHour} onValueChange={setScheduledHour}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString().padStart(2, '0')}>
                          {i.toString().padStart(2, '0')}h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={scheduledMinute} onValueChange={setScheduledMinute}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['00', '15', '30', '45'].map((m) => (
                        <SelectItem key={m} value={m}>
                          :{m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {scheduledDate && (
                  <p className="text-xs text-blue-400">
                    Será enviado em: {format(scheduledDate, "dd 'de' MMMM", { locale: ptBR })} às {scheduledHour}:{scheduledMinute}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Preview Toggle */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="h-4 w-4 mr-2" />
            {showPreview ? 'Ocultar Preview' : 'Ver Preview'}
          </Button>

          {/* Message Preview */}
          {showPreview && (
            <div className="p-4 rounded-lg bg-card border">
              <p className="text-xs text-muted-foreground mb-2">Como o usuário verá:</p>
              <div className="space-y-2">
                {content && <p className="text-sm">{content}</p>}
                {mediaPreview && (
                  <div className="relative rounded-lg overflow-hidden">
                    {isPpv ? (
                      <div className="relative">
                        {mediaType === 'image' ? (
                          <img loading="lazy" decoding="async" 
                            src={mediaPreview} 
                            alt="Preview" 
                            className="w-full max-h-32 object-cover blur-xl"
                          />
                        ) : (
                          <div className="w-full h-32 bg-muted" />
                        )}
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                          <Lock className="h-8 w-8 text-white mb-2" />
                          <p className="text-white font-medium">
                            {formatCurrency(parseFloat(ppvPrice || '0'))}
                          </p>
                          <Button size="sm" className="mt-2">
                            Desbloquear
                          </Button>
                        </div>
                      </div>
                    ) : (
                      mediaType === 'image' ? (
                        <img loading="lazy" decoding="async" 
                          src={mediaPreview} 
                          alt="Preview" 
                          className="w-full max-h-32 object-cover"
                        />
                      ) : (
                        <video preload="none" 
                          src={mediaPreview} 
                          className="w-full max-h-32 object-cover"
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-4 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button 
            className="flex-1"
            onClick={handleSubmit}
            disabled={createBroadcast.isPending || isUploading || (!content && !mediaFile)}
          >
            {createBroadcast.isPending || isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isUploading ? 'Enviando...' : 'Processando...'}
              </>
            ) : (
              <>
                <Megaphone className="h-4 w-4 mr-2" />
                Enviar para {recipientCount || 0} pessoas
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
