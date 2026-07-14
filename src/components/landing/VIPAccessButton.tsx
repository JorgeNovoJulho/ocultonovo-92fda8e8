import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { Crown, Lock, Users, Sparkles } from 'lucide-react';
import { VIPUpgradeModal } from './VIPUpgradeModal';
import { cn } from '@/lib/utils';

export function VIPAccessButton() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  const isVIP = profile?.plan_type === 'vip';
  
  const handleClick = () => {
    if (!user) {
      // Usuário não logado - redireciona para login
      navigate('/login?redirect=/couples');
      return;
    }
    
    if (isVIP) {
      // Usuário VIP - acessa a seção (futura rota /couples)
      navigate('/couples');
      return;
    }
    
    // Usuário logado mas não VIP - exibe modal de upgrade
    setShowUpgradeModal(true);
  };
  
  return (
    <>
      <div className="pt-6 animate-fade-in" style={{ animationDelay: '0.4s' }}>
        <Button
          onClick={handleClick}
          size="lg"
          className={cn(
            "px-8 py-6 text-lg font-bold rounded-full",
            "bg-gradient-to-r from-pink-500 via-primary to-pink-600",
            "hover:from-pink-400 hover:via-primary hover:to-pink-500",
            "shadow-[0_0_30px_rgba(236,72,153,0.4)]",
            "hover:shadow-[0_0_40px_rgba(236,72,153,0.6)]",
            "transition-all duration-300",
            "group"
          )}
        >
          {isVIP ? (
            <>
              <Users className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" />
              Acessar Área de Casais
            </>
          ) : (
            <>
              <Lock className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" />
              Acessar Área VIP de Casais
              <Crown className="h-4 w-4 ml-2 text-yellow-400" />
            </>
          )}
        </Button>
        
        {!isVIP && (
          <p className="text-xs text-muted-foreground mt-3">
            <Sparkles className="h-3 w-3 inline mr-1" />
            Exclusivo para assinantes VIP
          </p>
        )}
      </div>
      
      <VIPUpgradeModal 
        open={showUpgradeModal} 
        onOpenChange={setShowUpgradeModal} 
      />
    </>
  );
}
