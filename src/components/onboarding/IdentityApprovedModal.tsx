/**
 * IdentityApprovedModal — Confirmação pós-verificação biométrica
 * Exibido após o sucesso do LivenessCheckModal no fluxo de onboarding.
 * Requer clique explícito do usuário para avançar para a próxima etapa.
 */
import { memo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ShieldCheck, Lock, ChevronRight } from 'lucide-react';

interface IdentityApprovedModalProps {
  open: boolean;
  onContinue: () => void;
  onOpenChange: (open: boolean) => void;
}

export const IdentityApprovedModal = memo(function IdentityApprovedModal({
  open,
  onContinue,
  onOpenChange,
}: IdentityApprovedModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-emerald-500/30">
        <div className="px-6 pt-7 pb-6 text-center animate-fade-in">
          {/* Success ring */}
          <div className="relative w-20 h-20 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
            <div className="relative w-full h-full rounded-full bg-emerald-500/10 flex items-center justify-center border-2 border-emerald-500">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
          </div>

          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-bold">
              Identidade aprovada!
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Sua verificação biométrica foi concluída com sucesso. Agora você
              tem acesso ao selo verificado e a todos os recursos da plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center justify-center gap-2 text-emerald-500">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-medium">Conta verificada</span>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground/80 bg-muted/40 border border-border/50 rounded-md p-2 text-left">
            <Lock className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
            <span>
              Seus dados biométricos são protegidos por{' '}
              <strong>criptografia de ponta a ponta</strong> e{' '}
              <strong>não são compartilhados com terceiros</strong>, em
              conformidade com a LGPD (Lei nº 13.709/2018).
            </span>
          </div>

          <Button
            onClick={onContinue}
            className="w-full h-11 mt-5 font-medium gap-2 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
            style={{ touchAction: 'manipulation' }}
          >
            Continuar para próxima etapa
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
