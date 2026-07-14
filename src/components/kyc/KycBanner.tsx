/**
 * KycBanner — Faixa de alerta fixa exibida no topo do feed/perfil
 * enquanto o usuário não tiver o Selo Oculto aprovado.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ShieldCheck, X, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAccountStatus, KYC_DEADLINE_DAYS } from '@/hooks/useAccountStatus';
import { useProfile } from '@/hooks/useProfile';
import { KycUploadModal } from './KycUploadModal';
import { cn } from '@/lib/utils';

export function KycBanner() {
  const { isVerified, isBlocked, kycPending, daysRemaining, deadlineProgress, isLoading } =
    useAccountStatus();
  const { profile } = useProfile();
  const dismissKey = useMemo(() => `oculto-kyc-banner-dismissed-${profile?.id || 'anonymous'}`, [profile?.id]);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('oculto-kyc-banner-dismissed-anonymous') === 'true';
  });
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.localStorage.getItem(dismissKey) === 'true');
  }, [dismissKey]);

  useEffect(() => {
    if (!isVerified || typeof window === 'undefined') return;
    window.localStorage.setItem(dismissKey, 'true');
    setDismissed(true);
  }, [dismissKey, isVerified]);

  // Não renderizar se verificado, carregando ou dispensado (exceto se bloqueado)
  if (isLoading || isVerified) return null;
  if (dismissed && !isBlocked) return null;

  // Progresso real do envio: documento (frente+verso) = 50%, selfie = 50%
  const documentDone =
    !!(profile as any)?.kyc_document_url && !!(profile as any)?.kyc_document_back_url;
  const selfieDone = !!(profile as any)?.kyc_selfie_url;
  const completed = (documentDone ? 1 : 0) + (selfieDone ? 1 : 0);
  const uploadProgress = Math.round((completed / 2) * 100);
  const hasPartialUpload = uploadProgress > 0 && uploadProgress < 100;
  const allUploaded = uploadProgress === 100;

  const submittedAt = (profile as any)?.kyc_submitted_at as string | undefined;
  const submittedFormatted = submittedAt
    ? new Date(submittedAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const urgent = daysRemaining <= 7 && daysRemaining > 0;
  // Quando tudo enviado (kycPending ou allUploaded), prioriza visual verde — mesmo se prazo expirou
  const awaitingApproval = (kycPending || allUploaded);
  const expired = isBlocked && !awaitingApproval;

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="kyc-banner"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          onClick={() => setShowUpload(true)}
          className={`
            relative w-full px-4 py-2.5 flex items-center gap-3 cursor-pointer shadow-md
            ${expired
              ? 'bg-gradient-to-r from-destructive to-destructive/80 border-b-2 border-destructive text-destructive-foreground'
              : awaitingApproval
                ? 'bg-gradient-to-r from-emerald-600 to-green-500 border-b-2 border-emerald-500 text-white'
                : urgent
                  ? 'bg-gradient-to-r from-[hsl(35,93%,50%)] to-[hsl(45,93%,55%)] border-b-2 border-[hsl(45,93%,47%)] text-black'
                  : 'bg-gradient-to-r from-[hsl(330,85%,55%)] to-[hsl(280,75%,55%)] border-b-2 border-[hsl(330,85%,55%)] text-white'
            }
          `}
          style={{ contain: 'layout style paint' }}
        >
          {/* Ícone */}
          <div className="shrink-0 p-1.5 rounded-lg bg-white/20 backdrop-blur-sm">
            {expired ? (
              <AlertTriangle className="h-4 w-4 text-current" />
            ) : awaitingApproval ? (
              <ShieldCheck className="h-4 w-4 text-current" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-current" />
            )}
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight truncate">
              {expired
                ? '⛔ Prazo de 30 dias expirado — funções bloqueadas'
                : awaitingApproval
                  ? '✅ Documentos enviados — aguardando aprovação da moderação'
                  : hasPartialUpload
                    ? `📤 Verificação ${uploadProgress}% — falta ${selfieDone ? 'o documento' : 'a selfie'}`
                    : urgent
                      ? `⚠️ ${daysRemaining} dia${daysRemaining !== 1 ? 's' : ''} para validar sua identidade`
                      : '🔐 Valide sua identidade para desbloquear todas as funções'}
            </p>
            <p className="text-[10px] opacity-90 mt-0.5 truncate">
              {awaitingApproval
                ? submittedFormatted
                  ? `Enviado em ${submittedFormatted} • 100% concluído`
                  : '100% concluído • aguardando análise'
                : hasPartialUpload
                  ? 'Toque para enviar o restante →'
                  : 'Toque aqui para resolver →'}
            </p>

            {/* Barra de progresso: verde quando enviando ou aguardando aprovação */}
            {awaitingApproval ? (
              <div className="relative h-1.5 mt-1 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-300 to-green-200 w-full"
                  aria-label="Verificação 100% concluída"
                />
              </div>
            ) : hasPartialUpload ? (
              <div className="relative h-1.5 mt-1 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-500"
                  style={{ width: `${uploadProgress}%` }}
                  aria-label={`Verificação ${uploadProgress}% concluída`}
                />
              </div>
            ) : (
              <Progress
                value={deadlineProgress}
                className="h-1 mt-1 bg-white/25"
              />
            )}
          </div>

          {/* CTA */}
          {!awaitingApproval && (
            <Button
              size="sm"
              className="shrink-0 h-7 text-xs px-2.5 gap-1 bg-white text-black hover:bg-white/90 font-semibold"
              onClick={(e) => { e.stopPropagation(); setShowUpload(true); }}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Verificar</span>
            </Button>
          )}

          {/* Fechar (apenas se não bloqueado) */}
          {!expired && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDismissed(true);
                if (typeof window !== 'undefined') window.localStorage.setItem(dismissKey, 'true');
              }}
              className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              aria-label="Fechar aviso"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </motion.div>
      </AnimatePresence>

      <KycUploadModal open={showUpload} onOpenChange={setShowUpload} />
    </>
  );
}
