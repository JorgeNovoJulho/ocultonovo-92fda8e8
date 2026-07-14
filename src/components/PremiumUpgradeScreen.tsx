import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Crown, Lock, Sparkles, Check, ArrowRight, 
  DollarSign, BarChart3, Gift, Ticket, TrendingUp, RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

interface PremiumUpgradeScreenProps {
  featureName: string;
}

const benefits = [
  { icon: DollarSign, text: 'Gerencie seus ganhos e solicite saques' },
  { icon: BarChart3, text: 'Veja relatórios detalhados de rendimentos' },
  { icon: Gift, text: 'Converta saldo em créditos' },
  { icon: Ticket, text: 'Crie cupons promocionais' },
  { icon: TrendingUp, text: 'Acompanhe seu crescimento mensal' },
];

export function PremiumUpgradeScreen({ featureName }: PremiumUpgradeScreenProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [checking, setChecking] = useState(false);

  const handleCheckSubscription = async () => {
    setChecking(true);
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    // Small delay to let query refetch
    setTimeout(() => setChecking(false), 1500);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-lg w-full text-center space-y-8"
      >
        {/* Icon com glow */}
        <div className="relative w-32 h-32 mx-auto">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-pink-500/30 animate-pulse" />
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-primary/20 to-pink-500/20 flex items-center justify-center">
            <Lock className="h-12 w-12 text-primary" />
          </div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          >
            <Crown className="absolute -top-2 -right-2 h-10 w-10 text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]" />
          </motion.div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <Badge className="bg-gradient-to-r from-primary/20 to-pink-500/20 text-primary border-primary/40">
            <Crown className="h-3 w-3 mr-1 text-yellow-400" />
            Premium ou VIP
          </Badge>
          
          <h1 className="text-3xl font-black text-foreground">
            Recurso Exclusivo para Assinantes
          </h1>
          
          <p className="text-muted-foreground text-lg">
            Para acessar <span className="text-primary font-semibold">{featureName}</span>, 
            você precisa de um plano Premium ou VIP.
          </p>
        </div>

        {/* Benefits */}
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 text-yellow-400" />
            O que você desbloqueia
          </h3>
          
          <div className="space-y-3">
            {benefits.map((benefit, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i }}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <benefit.icon className="h-4 w-4 text-primary" />
                </div>
                <span>{benefit.text}</span>
                <Check className="h-4 w-4 text-green-500 ml-auto" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Link to="/checkout?plan=monthly&amount=25.90" className="w-full">
            <Button 
              size="lg"
              className="w-full h-14 bg-gradient-to-r from-primary via-pink-500 to-primary 
                hover:from-primary/90 hover:via-pink-500/90 hover:to-primary/90
                shadow-[0_0_30px_rgba(168,85,247,0.4)]
                hover:shadow-[0_0_40px_rgba(168,85,247,0.6)]
                font-bold text-lg transition-all duration-300"
            >
              <Crown className="h-5 w-5 mr-2 text-yellow-400" />
              Fazer Upgrade para Premium
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
          
          <Link to="/checkout?plan=monthly&amount=25.90" className="w-full">
            <Button 
              variant="outline" 
              size="lg"
              className="w-full border-border/50 hover:border-primary/50 hover:bg-primary/5"
            >
              Ver todos os planos
            </Button>
          </Link>
        </div>

        {/* Fallback: Verificar Assinatura */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCheckSubscription}
          disabled={checking}
          className="mx-auto text-muted-foreground hover:text-primary"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Verificando...' : 'Já pagou? Verificar assinatura'}
        </Button>

        {/* Price */}
        <p className="text-sm text-muted-foreground">
          A partir de <span className="text-primary font-bold">R$ 25,90</span>/mês ou <span className="text-primary font-bold">R$ 238,80</span>/ano (R$ 19,90/mês)
        </p>
      </motion.div>
    </div>
  );
}
