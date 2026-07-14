/**
 * Componente de Modal de Upsell para usuários gratuitos
 * Exibido quando usuários atingem limites ou tentam acessar features premium
 */
import { useState } from 'react';
import { Lock, Crown, Sparkles, MessageCircle, Radar, Users, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { SubscriptionModal } from './SubscriptionModal';

type RestrictionType = 
  | 'messages' 
  | 'radar' 
  | 'comments' 
  | 'vip_content' 
  | 'affiliate' 
  | 'likes' 
  | 'followers'
  | 'visits'
  | 'paid_message'
  | 'chat_media';

interface UpsellModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restrictionType: RestrictionType;
  remainingUses?: number;
  maxUses?: number;
}

const restrictionConfig: Record<RestrictionType, {
  icon: typeof Lock;
  title: string;
  description: string;
  benefit: string;
}> = {
  messages: {
    icon: MessageCircle,
    title: 'Limite de Mensagens Atingido',
    description: 'Você atingiu o limite diário de mensagens do plano gratuito.',
    benefit: 'Mensagens ilimitadas',
  },
  radar: {
    icon: Radar,
    title: 'Limite de Buscas Atingido',
    description: 'Você atingiu o limite diário de buscas no Radar.',
    benefit: 'Buscas ilimitadas no Radar',
  },
  comments: {
    icon: MessageCircle,
    title: 'Comentários Bloqueados',
    description: 'Comentários estão disponíveis apenas para assinantes.',
    benefit: 'Comentar em posts',
  },
  vip_content: {
    icon: Crown,
    title: 'Conteúdo VIP Bloqueado',
    description: 'Crie conteúdo exclusivo para seus fãs mais dedicados.',
    benefit: 'Criar conteúdo VIP',
  },
  affiliate: {
    icon: Users,
    title: 'Programa de Afiliados',
    description: 'Ganhe comissões indicando novos usuários.',
    benefit: 'Acesso ao programa de afiliados',
  },
  likes: {
    icon: Heart,
    title: 'Ver Quem Curtiu',
    description: 'Descubra quem está interessado no seu conteúdo.',
    benefit: 'Ver lista completa de curtidas',
  },
  followers: {
    icon: Users,
    title: 'Ver Seguidores',
    description: 'Veja todos os seus seguidores sem restrições.',
    benefit: 'Ver lista completa de seguidores',
  },
  visits: {
    icon: Lock,
    title: 'Quem Visitou seu Perfil',
    description: 'Disponível a partir do plano Premium.',
    benefit: 'Ver todos os visitantes do seu perfil',
  },
  paid_message: {
    icon: MessageCircle,
    title: 'Mensagem para Criador VIP',
    description: 'Este criador aceita mensagens pagas ou de assinantes do canal.',
    benefit: 'Enviar mensagens para criadores VIP',
  },
  chat_media: {
    icon: Lock,
    title: 'Mídia Exclusiva para Assinantes',
    description: 'Envio e visualização de fotos, vídeos e áudios no chat estão disponíveis apenas para assinantes Premium e VIP.',
    benefit: 'Enviar e receber fotos, vídeos e áudios no chat',
  },
};

export function UpsellModal({ 
  open, 
  onOpenChange, 
  restrictionType,
  remainingUses,
  maxUses,
}: UpsellModalProps) {
  const [showSubscription, setShowSubscription] = useState(false);
  const config = restrictionConfig[restrictionType];
  const IconComponent = config.icon;

  const handleUpgradeClick = () => {
    onOpenChange(false);
    setShowSubscription(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border-primary/20 w-[calc(100vw-1rem)] sm:w-auto max-w-md z-[9999] max-h-[92dvh] overflow-y-auto rounded-2xl p-4 sm:p-6 scrollbar-hide">
          <DialogHeader className="text-center">
            {/* Lock Icon with Glow */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-30" />
              <Lock className="h-10 w-10 text-primary" />
            </div>

            <DialogTitle className="text-2xl font-bold text-center flex items-center justify-center gap-2">
              <IconComponent className="h-6 w-6 text-primary" />
              {config.title}
            </DialogTitle>
            
            <DialogDescription className="text-center text-muted-foreground pt-2">
              {config.description}
            </DialogDescription>

            {/* Usage Counter */}
            {remainingUses !== undefined && maxUses !== undefined && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10">
                  {remainingUses} / {maxUses} restantes hoje
                </Badge>
              </div>
            )}
          </DialogHeader>

          {/* Benefits Preview */}
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50 mt-4">
            <p className="text-sm font-medium text-foreground mb-3">
              Com o plano Premium você terá:
            </p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                {config.benefit}
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                Mensagens ilimitadas e acesso total a mídias
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                Selo de verificado e upload em 4K/HD
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                A partir de R$ 24,92/mês (anual R$ 299)
              </li>
            </ul>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-3 mt-4">
            <Button 
              onClick={handleUpgradeClick}
              className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold h-12 shadow-[0_0_20px_rgba(255,0,127,0.3)]"
            >
              <Crown className="mr-2 h-5 w-5" />
              Fazer Upgrade Agora
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              Continuar no plano gratuito
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscription Modal for plan selection & checkout */}
      <SubscriptionModal
        open={showSubscription}
        onOpenChange={setShowSubscription}
        onSubscribe={() => setShowSubscription(false)}
      />
    </>
  );
}
