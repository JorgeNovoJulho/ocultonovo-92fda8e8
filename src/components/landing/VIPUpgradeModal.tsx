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
  Crown, 
  Lock, 
  Heart, 
  Users, 
  MessageCircle, 
  Sparkles, 
  ArrowRight 
} from 'lucide-react';
import { useBetaGuard } from '@/hooks/useBetaGuard';

interface VIPUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VIPUpgradeModal({ open, onOpenChange }: VIPUpgradeModalProps) {
  const { isLocked, lockedLabel } = useBetaGuard('vip_channels');
  const benefits = [
    { icon: Users, text: 'Chat exclusivo com outros casais verificados' },
    { icon: Heart, text: 'Matching avançado por interesses e desejos' },
    { icon: MessageCircle, text: 'Mensagens ilimitadas na área de casais' },
    { icon: Sparkles, text: 'Eventos e encontros exclusivos' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card/95 backdrop-blur-xl border-pink-500/30 max-w-lg shadow-[0_0_60px_rgba(236,72,153,0.3)]">
        <DialogHeader className="text-center">
          {/* Icon com glow */}
          <div className="relative w-24 h-24 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pink-500/30 to-primary/30 animate-pulse" />
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-pink-500/20 to-primary/20 flex items-center justify-center">
              <Lock className="h-10 w-10 text-pink-400" />
            </div>
            <Crown className="absolute -top-2 -right-2 h-8 w-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
          </div>
          
          <DialogTitle className="text-2xl font-black">
            Área Exclusiva para Casais
          </DialogTitle>
          
          <Badge className="mx-auto mt-2 bg-gradient-to-r from-pink-500/20 to-primary/20 text-pink-300 border-pink-500/40">
            <Crown className="h-3 w-3 mr-1 text-yellow-400" />
            Somente VIP
          </Badge>
          
          <DialogDescription className="text-muted-foreground pt-4">
            Desbloqueie o acesso à área exclusiva de casais liberais e conecte-se
            com outros casais que compartilham os mesmos interesses.
          </DialogDescription>
        </DialogHeader>
        
        {/* Benefícios */}
        <div className="space-y-3 py-4">
          <h4 className="text-sm font-semibold text-foreground">
            O que você desbloqueia:
          </h4>
          
          <div className="space-y-2">
            {benefits.map((item, i) => (
              <div 
                key={i} 
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <div className="h-8 w-8 rounded-full bg-pink-500/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-4 w-4 text-pink-400" />
                </div>
                {item.text}
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
            <Link to="/checkout?plan=monthly&amount=145.90" className="w-full" onClick={() => onOpenChange(false)}>
              <Button 
                className="w-full h-12 bg-gradient-to-r from-pink-500 via-primary to-pink-600 
                  hover:from-pink-400 hover:via-primary hover:to-pink-500
                  shadow-[0_0_20px_rgba(236,72,153,0.4)]
                  font-bold text-lg"
              >
                <Crown className="h-5 w-5 mr-2 text-yellow-400" />
                Fazer Upgrade para VIP
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
        
        {/* Preço / aviso beta */}
        {isLocked ? (
          <p className="text-center text-xs text-muted-foreground">
            Canais VIP pagos serão liberados no <span className="text-pink-400 font-semibold">lançamento oficial</span>.
          </p>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            A partir de <span className="text-pink-400 font-semibold">R$ 145,90/mês</span>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
