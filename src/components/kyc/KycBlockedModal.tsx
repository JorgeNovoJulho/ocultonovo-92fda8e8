/**
 * KycBlockedModal — Modal informativo exibido quando a conta está bloqueada
 * por ter ultrapassado 30 dias sem o Selo Oculto aprovado.
 * Bloqueia interações e instrui o usuário a regularizar.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldX, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAccountStatus } from '@/hooks/useAccountStatus';
import { KycUploadModal } from './KycUploadModal';

export function KycBlockedModal() {
  const { isBlocked, kycPending, isLoading } = useAccountStatus();
  const [showKyc, setShowKyc] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && isBlocked && !kycPending) {
      setOpen(true);
    }
  }, [isBlocked, kycPending, isLoading]);

  if (!isBlocked || kycPending) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={() => {/* não fechar clicando fora */}}>
        <DialogContent
          className="scrollbar-hide w-[calc(100vw-1rem)] max-w-md sm:max-w-md bg-card border-destructive/40 max-h-[92dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-2 gap-4 sm:gap-5"
          >
            {/* Ícone */}
            <div className="relative">
              <div className="p-4 sm:p-5 rounded-full bg-destructive/10 ring-4 ring-destructive/20">
                <ShieldX className="h-10 w-10 sm:h-12 sm:w-12 text-destructive" />
              </div>
              <div className="absolute -top-1 -right-1 flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-destructive text-white text-[10px] sm:text-xs font-bold">
                30
              </div>
            </div>

            {/* Título */}
            <div>
              <DialogTitle className="text-lg sm:text-xl font-bold text-destructive mb-2">
                Conta Temporariamente Bloqueada
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                O prazo de <strong>30 dias</strong> para validação de identidade expirou.
                Valide sua identidade para restaurar o acesso completo à plataforma.
              </DialogDescription>
            </div>

            {/* O que está bloqueado */}
            <div className="w-full bg-muted/30 rounded-xl p-3 sm:p-4 text-left space-y-2">
              <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 sm:mb-3">
                Funções bloqueadas:
              </p>
              {[
                'Curtir, comentar e seguir perfis',
                'Enviar e responder mensagens',
                'Editar perfil e bloquear usuários',
                'Criar conteúdo pago (VIP)',
              ].map((item) => (

                <div key={item} className="flex items-center gap-2 text-[11px] sm:text-xs text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                  <span className="leading-snug">{item}</span>
                </div>
              ))}
            </div>

            {/* Info de desbloqueio */}
            <div className="flex items-start gap-2 w-full p-3 bg-primary/8 border border-primary/20 rounded-lg text-left">
              <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
                Assim que seus documentos forem aprovados, <strong>todas as restrições são removidas automaticamente</strong>, independente da data.
              </p>
            </div>

            {/* CTA */}
            <Button
              className="w-full bg-gradient-to-r from-primary to-secondary gap-2 h-11 sticky bottom-0"
              onClick={() => { setOpen(false); setShowKyc(true); }}
            >
              <ShieldCheck className="h-5 w-5" />
              Validar Identidade Agora
            </Button>
          </motion.div>
        </DialogContent>
      </Dialog>

      <KycUploadModal open={showKyc} onOpenChange={(v) => {
        setShowKyc(v);
        if (!v) setOpen(false); // Não reabre o modal de bloqueio após envio
      }} />
    </>
  );
}
