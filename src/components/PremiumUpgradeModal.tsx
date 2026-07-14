import { Link } from 'react-router-dom';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Crown, Lock, Sparkles, Check, ArrowRight,
  DollarSign, BarChart3, Gift, Ticket
} from 'lucide-react';
import { useBetaGuard } from '@/hooks/useBetaGuard';

interface PremiumUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
}

const benefits = [
  { icon: DollarSign, text: 'Gerencie seus ganhos e saques' },
  { icon: BarChart3, text: 'Relatórios detalhados de rendimentos' },
  { icon: Gift, text: 'Converta saldo em créditos' },
  { icon: Ticket, text: 'Cupons promocionais exclusivos' },
];

export function PremiumUpgradeModal({ open, onOpenChange, feature = "recursos financeiros" }: PremiumUpgradeModalProps) {
  const { isLocked, lockedLabel } = useBetaGuard('subscriptions');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card/95 backdrop-blur-xl border-primary/30 max-w-[calc(100vw-2rem)] sm:max-w-lg shadow-[0_0_60px_rgba(168,85,247,0.3)] scrollbar-hide">
        <DialogHeader className="text-center">
          {/* Icon com glow */}
          <div className="relative w-24 h-24 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-pink-500/30 animate-pulse" />
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary/20 to-pink-500/20 flex items-center justify-center">
              <Lock className="h-10 w-10 text-primary" />
            </div>
            <Crown className="absolute -top-2 -right-2 h-8 w-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
          </div>
          
          <DialogTitle className="text-2xl font-black">
            Recurso Exclusivo
          </DialogTitle>
          
          <Badge className="mx-auto mt-2 bg-gradient-to-r from-primary/20 to-pink-500/20 text-foreground border-primary/40">
            <Crown className="h-3 w-3 mr-1 text-yellow-400" />
            Premium ou VIP
          </Badge>
          
          <DialogDescription className="text-muted-foreground pt-4">
            Para acessar {feature}, você precisa de um plano Premium ou VIP.
          </DialogDescription>
        </DialogHeader>
        
        {/* Benefícios */}
        <div className="space-y-3 py-4">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-yellow-400" />
            O que você desbloqueia:
          </h4>
          
          <div className="space-y-2">
            {benefits.map((item, i) => (
              <div 
                key={i} 
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-4 w-4 text-primary" />
                </div>
                <span>{item.text}</span>
                <Check className="h-4 w-4 text-green-500 ml-auto" />
              </div>
            ))}
          </div>
        </div>
        
        {/* CTAs */}
        <div className="flex flex-col gap-3 pt-2">
          {isLocked ? (
            <Button
              disabled
              className="w-full h-12 bg-muted/30 text-muted-foreground font-bold text-lg cursor-not-allowed"
            >
              <Lock className="h-5 w-5 mr-2" />
              {lockedLabel}
            </Button>
          ) : (
            <Link to="/checkout?plan=monthly&amount=25.90" className="w-full">
              <Button 
                className="w-full h-12 bg-gradient-to-r from-primary via-pink-500 to-primary 
                  hover:from-primary/90 hover:via-pink-500/90 hover:to-primary/90
                  shadow-[0_0_20px_rgba(168,85,247,0.4)]
                  font-bold text-lg"
              >
                <Crown className="h-5 w-5 mr-2 text-yellow-400" />
                Fazer Upgrade para Premium
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          )}
          
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            {isLocked ? 'Fechar' : 'Continuar no plano atual'}
          </Button>
        </div>
        
        {/* Preço */}
        {!isLocked && (
          <p className="text-center text-xs text-muted-foreground">
            A partir de <span className="text-primary font-semibold">R$ 25,90/mês</span> ou <span className="text-primary font-semibold">R$ 238,80/ano</span>
          </p>
        )}
        {isLocked && (
          <p className="text-center text-xs text-muted-foreground">
            Durante o <span className="text-primary font-semibold">Beta</span>, todos têm acesso aos recursos sociais Premium gratuitamente.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
