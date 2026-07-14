/**
 * Modal de "gate" para criação de comunidade.
 * - Free: explica que é exclusivo Premium/VIP e oferece CTA "Ver planos".
 * - Premium/VIP no limite: avisa quantas comunidades já foram criadas.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Users2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason?: string;
  current?: number;
  limit?: number;
}

export function CommunityCreateGateModal({ open, onOpenChange, reason, current, limit }: Props) {
  const navigate = useNavigate();

  const isPlanBlock = reason === 'plan_not_allowed';
  const isLimit = reason === 'limit_reached';
  const isFrozen = reason === 'frozen_post_beta';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-purple-600/20 border border-fuchsia-500/30">
            {isPlanBlock || isFrozen ? <Crown className="h-6 w-6 text-amber-300" /> : <Users2 className="h-6 w-6 text-fuchsia-300" />}
          </div>
          <DialogTitle className="text-center text-base">
            {isPlanBlock ? 'Criar comunidades é Premium/VIP' : isLimit ? 'Limite de comunidades atingido' : isFrozen ? 'Sua comunidade está congelada' : 'Criação indisponível'}
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-muted-foreground">
            {isPlanBlock && 'A criação de comunidades é exclusiva para usuários Premium e VIP. Faça upgrade para criar a sua tribo.'}
            {isLimit && `Você já criou ${current ?? 0}/${limit ?? 5} comunidades. Arquive uma existente para liberar espaço.`}
            {isFrozen && 'O período de beta terminou. Para reativar e editar sua comunidade, assine o plano Premium ou VIP. Enquanto isso, o card continua visível na página Comunidades Ocultas, mas ninguém consegue acessar o conteúdo.'}
            {!isPlanBlock && !isLimit && !isFrozen && 'A criação de comunidades está temporariamente indisponível.'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 flex flex-col gap-2">
          {isPlanBlock && (
            <Button
              className="w-full bg-gradient-to-r from-amber-500 to-fuchsia-600 text-white"
              onClick={() => {
                onOpenChange(false);
                navigate('/subscriptions');
              }}
            >
              <Crown className="h-4 w-4 mr-1.5" /> Ver planos
            </Button>
          )}
          {isLimit && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                navigate('/comunidades');
              }}
            >
              Gerenciar minhas comunidades
            </Button>
          )}
          {isFrozen && (
            <Button
              className="w-full bg-gradient-to-r from-amber-500 to-fuchsia-600 text-white"
              onClick={() => {
                onOpenChange(false);
                navigate('/subscriptions');
              }}
            >
              <Crown className="h-4 w-4 mr-1.5" /> Assinar Premium ou VIP
            </Button>
          )}
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
