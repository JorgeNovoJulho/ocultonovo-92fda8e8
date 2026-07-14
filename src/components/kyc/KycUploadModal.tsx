/**
 * KycUploadModal — Interface de upload KYC mobile-first.
 * Abre a câmera do dispositivo diretamente via getUserMedia.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  X,
  RefreshCw,
  ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKycUpload, KycType } from '@/hooks/useKycUpload';
import { CameraCapture } from './CameraCapture';

type DocumentSide = 'front' | 'back';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Step = 'choose' | 'capture-method' | 'live-camera' | 'preview' | 'done';

export function KycUploadModal({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [kycType, setKycType] = useState<KycType | null>(null);
  const [documentSide, setDocumentSide] = useState<DocumentSide>('front');
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [adminNotified, setAdminNotified] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();

  const { uploading, progress, error, success, upload, reset } = useKycUpload();

  const handleTypeSelect = (type: KycType) => {
    setKycType(type);
    setDocumentSide('front');
    if (type === 'selfie') {
      setCameraFacing('user');
      setStep('live-camera');
    } else {
      setStep('capture-method');
    }
  };

  const handleCameraCapture = useCallback((file: File) => {
    if (preview) URL.revokeObjectURL(preview);
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setStep('preview');
  }, [preview]);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
    setStep('preview');
    // Reset input para permitir re-seleção
    e.target.value = '';
  }, [preview]);

  // Estado de progresso a partir do perfil (persistido no banco)
  const docFrontDone = !!(profile as any)?.kyc_document_url;
  const docBackDone = !!(profile as any)?.kyc_document_back_url;
  const documentDone = docFrontDone && docBackDone;
  const selfieDone = !!(profile as any)?.kyc_selfie_url;
  const bothDone = documentDone && selfieDone;
  const completedCount = (documentDone ? 1 : 0) + (selfieDone ? 1 : 0);
  const overallProgress = Math.round((completedCount / 2) * 100);

  const handleUpload = async () => {
    if (!selectedFile || !kycType) return;
    await upload(selectedFile, kycType, kycType === 'document' ? documentSide : 'front');
  };

  // Transição pós-upload: usa useEffect para evitar setState durante render.
  useEffect(() => {
    if (!success) return;

    // Documento — frente enviada: ir direto para captura do verso
    if (kycType === 'document' && documentSide === 'front' && !docBackDone) {
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setSelectedFile(null);
      setDocumentSide('back');
      setCameraFacing('environment');
      reset();
      setStep('live-camera');
      return;
    }

    // Ainda falta o outro método — volta à escolha
    if (!bothDone) {
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setSelectedFile(null);
      setKycType(null);
      setDocumentSide('front');
      setCameraFacing('environment');
      reset();
      setStep('choose');
      return;
    }

    // Tudo enviado → conclusão
    setStep('done');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, bothDone, docBackDone]);

  const finishedFlow = success && bothDone;

  // Notifica admin master assim que o fluxo é concluído (uma única vez)
  useEffect(() => {
    if (step !== 'done' || adminNotified) return;
    const userName =
      profile?.display_name || profile?.name || profile?.username || user?.email?.split('@')[0] || 'Usuário';
    (async () => {
      try {
        await (supabase as any).from('admin_notifications').insert({
          type: 'kyc_submitted',
          title: '🪪 Novo Documento de Identidade',
          body: `${userName} enviou ${kycType === 'selfie' ? 'selfie' : 'documento (frente e verso)'} para validação.`,
          data: {
            url: '/admin/verifications',
            user_id: user?.id,
            profile_id: profile?.id,
            kyc_type: kycType,
          },
        });
      } catch (err) {
        console.warn('[KycUploadModal] notify admin failed', err);
      } finally {
        setAdminNotified(true);
      }
    })();
  }, [step, adminNotified, kycType, profile, user]);

  const handleClose = () => {
    if (uploading) return;
    if (preview) URL.revokeObjectURL(preview);
    // Atualiza status do perfil/conta para refletir envio
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      queryClient.invalidateQueries({ queryKey: ['account-status'] });
    }
    setStep('choose');
    setKycType(null);
    setDocumentSide('front');
    setCameraFacing('environment');
    setPreview(null);
    setSelectedFile(null);
    setAdminNotified(false);
    reset();
    onOpenChange(false);
  };

  const handleRetry = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedFile(null);
    reset();
    if (kycType === 'selfie') {
      setCameraFacing('user');
      setStep('live-camera');
    } else {
      setStep('capture-method');
    }
  };

  return (
    <Dialog open={open} onOpenChange={uploading ? undefined : handleClose}>
      <DialogContent
        className="bg-card border-border scrollbar-hide p-4 sm:p-6 w-[calc(100vw-1rem)] max-w-[420px] sm:max-w-md max-h-[92dvh] overflow-y-auto overscroll-contain rounded-2xl"
        onPointerDownOutside={uploading ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Validação de Identidade
          </DialogTitle>
          <DialogDescription>
            {step === 'choose'
              ? 'Escolha um método de verificação. Apenas um é necessário.'
              : step === 'done'
                ? 'Documento enviado! Aguarde a aprovação.'
                : step === 'capture-method'
                  ? `Como deseja enviar a ${documentSide === 'front' ? 'frente' : 'verso'} do documento?`
                  : step === 'live-camera'
                    ? kycType === 'document'
                      ? `Posicione a ${documentSide === 'front' ? 'frente' : 'verso'} do documento dentro do quadro.`
                      : 'Centralize o rosto no oval e mantenha boa iluminação.'
                  : `Confirme o envio de ${kycType === 'document' ? 'Documento' : 'Selfie'}`}
          </DialogDescription>
        </DialogHeader>

        {/* Input oculto apenas para galeria/arquivos */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelected}
        />

        <AnimatePresence mode="wait">
          {/* ── PASSO 1: ESCOLHA ── */}
          {step === 'choose' && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3 py-2"
            >
              <div className="space-y-2 mb-3">
                <p className="text-xs text-muted-foreground text-center">
                  Para concluir, envie <strong className="text-foreground">os dois</strong> métodos abaixo.
                </p>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Progresso da verificação</span>
                  <span className={cn(
                    "font-semibold",
                    overallProgress === 100 ? "text-emerald-500" : "text-primary"
                  )}>
                    {completedCount}/2 enviados • {overallProgress}%
                  </span>
                </div>
                <Progress
                  value={overallProgress}
                  className={cn(
                    "h-2 transition-colors",
                    overallProgress === 100 && "[&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-500"
                  )}
                />
              </div>

              <button
                onClick={() => !documentDone && handleTypeSelect('document')}
                disabled={documentDone}
                className={cn(
                  "w-full p-4 rounded-xl border-2 flex items-start gap-3 text-left transition-all relative overflow-hidden",
                  documentDone
                    ? "border-emerald-500/50 bg-gradient-to-r from-emerald-500/15 via-green-500/10 to-emerald-500/5 cursor-default"
                    : "border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
                )}
              >
                <div className={cn(
                  "p-2.5 rounded-lg shrink-0",
                  documentDone ? "bg-emerald-500/20" : "bg-primary/10"
                )}>
                  <CreditCard className={cn(
                    "h-5 w-5",
                    documentDone ? "text-emerald-500" : "text-primary"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm">Documento de Identidade</p>
                    {documentDone && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {documentDone
                      ? '✓ Frente e verso enviados'
                      : docFrontDone
                        ? 'Frente enviada — falta o verso'
                        : 'RG (frente e verso) ou CNH. Foto nítida.'}
                  </p>
                </div>
              </button>

              <button
                onClick={() => !selfieDone && handleTypeSelect('selfie')}
                disabled={selfieDone}
                className={cn(
                  "w-full p-4 rounded-xl border-2 flex items-start gap-3 text-left transition-all relative overflow-hidden",
                  selfieDone
                    ? "border-emerald-500/50 bg-gradient-to-r from-emerald-500/15 via-green-500/10 to-emerald-500/5 cursor-default"
                    : "border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
                )}
              >
                <div className={cn(
                  "p-2.5 rounded-lg shrink-0",
                  selfieDone ? "bg-emerald-500/20" : "bg-primary/10"
                )}>
                  <Camera className={cn(
                    "h-5 w-5",
                    selfieDone ? "text-emerald-500" : "text-primary"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm">Selfie de Segurança</p>
                    {selfieDone && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selfieDone
                      ? '✓ Selfie enviada'
                      : 'Foto do rosto com boa iluminação, olhando para a câmera.'}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg mt-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Seus documentos são criptografados e visíveis apenas para a equipe de moderação.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── PASSO 1.5: MÉTODO DE CAPTURA (DOCUMENTO) ── */}
          {step === 'capture-method' && (
            <motion.div
              key="capture-method"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-3 py-2"
            >
              <p className="text-xs text-muted-foreground text-center mb-2">
                Escolha como enviar a foto do seu documento.
              </p>

              <button
                onClick={() => {
                  setCameraFacing('environment');
                  setStep('live-camera');
                }}
                className={cn(
                  "w-full p-4 rounded-xl border-2 flex items-start gap-3 text-left transition-all",
                  "border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
                )}
              >
                <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                  <Camera className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Tirar Foto</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Abrir a câmera e fotografar o documento agora.
                  </p>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "w-full p-4 rounded-xl border-2 flex items-start gap-3 text-left transition-all",
                  "border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
                )}
              >
                <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                  <ImageIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Escolher da Galeria</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Selecionar uma foto já salva no dispositivo.
                  </p>
                </div>
              </button>

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => { setStep('choose'); setKycType(null); }}
              >
                ← Voltar
              </Button>
            </motion.div>
          )}

          {step === 'live-camera' && (
            <motion.div
              key="live-camera"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="py-2"
            >
              <CameraCapture
                facing={cameraFacing}
                guide={kycType === 'selfie' ? 'selfie' : 'document'}
                hint={
                  kycType === 'document'
                    ? documentSide === 'front'
                      ? 'Frente do RG / CNH'
                      : 'Verso do RG / CNH'
                    : 'Selfie de validação'
                }
                onCapture={handleCameraCapture}
                onCancel={() => {
                  if (kycType === 'document') {
                    setStep('capture-method');
                    return;
                  }

                  setStep('choose');
                  setKycType(null);
                }}
              />
            </motion.div>
          )}

          {/* ── PASSO 2: PREVIEW + UPLOAD ── */}
          {step === 'preview' && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4 py-2"
            >
              {preview && (
                <div className="relative rounded-xl overflow-hidden bg-muted/20">
                  <img loading="lazy" decoding="async"
                    src={preview}
                    alt="Preview"
                    className="w-full max-h-52 object-cover"
                  />
                  {!uploading && (
                    <button
                      onClick={handleRetry}
                      className="absolute top-2 right-2 bg-background/60 rounded-full p-1.5"
                    >
                      <X className="h-4 w-4 text-foreground" />
                    </button>
                  )}
                  <Badge className="absolute bottom-2 left-2 bg-background/60 text-foreground text-xs">
                    {kycType === 'document'
                      ? documentSide === 'front'
                        ? '📄 Documento — Frente'
                        : '📄 Documento — Verso'
                      : '🤳 Selfie'}
                  </Badge>
                </div>
              )}

              {uploading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {progress < 30 ? 'Comprimindo...' : progress < 70 ? 'Enviando...' : 'Salvando...'}
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleRetry}
                  disabled={uploading}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Tirar outra
                </Button>

                {!uploading && !error && (
                  <Button
                    size="sm"
                    className="flex-1 bg-gradient-to-r from-primary to-secondary gap-1.5"
                    onClick={handleUpload}
                  >
                    <Upload className="h-4 w-4" />
                    Enviar
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {/* ── PASSO 3: CONCLUÍDO ── */}
          {step === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-4 flex flex-col items-center gap-4 text-center"
            >
              <div className="p-4 rounded-full bg-primary/10">
                <CheckCircle2 className="h-10 w-10 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Documentos recebidos!</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Seu envio foi confirmado em nosso servidor e encaminhado ao administrador para validação. Você receberá uma notificação assim que for aprovado (geralmente em até 48h).
                </p>
              </div>

              <div className="w-full p-3 bg-primary/5 border border-primary/20 rounded-lg text-left space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-xs font-semibold text-foreground">Privacidade & Proteção de Dados</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Seus documentos são <strong>criptografados</strong> e armazenados em ambiente privado, com acesso restrito à equipe de moderação. O tratamento segue a <strong>LGPD (Lei 13.709/18)</strong>, o <strong>GDPR</strong> e os requisitos de <strong>18 U.S.C. §2257</strong>. Os dados são utilizados <strong>exclusivamente</strong> para verificação de identidade e maioridade, e podem ser removidos a qualquer momento mediante solicitação no menu de configurações.
                </p>
              </div>

              <div className="w-full p-2.5 bg-muted/30 rounded-lg text-[11px] text-muted-foreground">
                ⏳ Enquanto aguarda, seu acesso à plataforma permanece normal.
              </div>

              <Button onClick={handleClose} className="w-full">
                Entendido, fechar
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
