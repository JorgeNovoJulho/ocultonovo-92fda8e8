import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Rocket, TrendingUp, PartyPopper } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MilestoneCelebrationProps {
  show: boolean;
  realUsers: number;
  seedUsersPurged: number;
  onDismiss: () => void;
}

export function MilestoneCelebration({ 
  show, 
  realUsers, 
  seedUsersPurged, 
  onDismiss 
}: MilestoneCelebrationProps) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setVisible(true);
      
      // Fire confetti!
      const duration = 3000;
      const end = Date.now() + duration;

      const colors = ['#fbbf24', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

      (function frame() {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors,
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors,
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      })();

      // Fire center burst
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors,
        });
      }, 500);
    }
  }, [show]);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <Card className="relative max-w-md mx-4 border-2 border-primary/50 bg-gradient-to-br from-card via-card to-primary/10 shadow-2xl shadow-primary/20">
        <CardContent className="p-8 text-center space-y-6">
          {/* Animated Icon */}
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="relative flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary to-primary/80 rounded-full">
              <Rocket className="h-10 w-10 text-primary-foreground animate-bounce" />
            </div>
          </div>

          {/* Badge */}
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 px-4 py-1 text-sm">
            <TrendingUp className="h-4 w-4 mr-1" />
            Meta 3:1 Atingida!
          </Badge>

          {/* Title */}
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
            🚀 Meta Inicial Batida!
          </h2>

          {/* Message */}
          <p className="text-muted-foreground leading-relaxed">
            Parabéns! O número de usuários reais (<span className="font-bold text-foreground">{realUsers}</span>) 
            ultrapassou 3x a base inicial. Todos os <span className="font-bold text-foreground">{seedUsersPurged}</span> perfis 
            de teste foram removidos automaticamente.
          </p>

          {/* Stats */}
          <div className="flex justify-center gap-6 py-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{realUsers}</div>
              <div className="text-xs text-muted-foreground">Usuários Reais</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-500">100%</div>
              <div className="text-xs text-muted-foreground">Orgânico</div>
            </div>
          </div>

          {/* Celebration Icon */}
          <div className="flex justify-center gap-2">
            <PartyPopper className="h-6 w-6 text-amber-500 animate-pulse" />
            <span className="text-sm text-muted-foreground">Sua plataforma é agora 100% orgânica!</span>
            <PartyPopper className="h-6 w-6 text-amber-500 animate-pulse" />
          </div>

          {/* Dismiss Button */}
          <Button 
            onClick={handleDismiss}
            className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            Continuar para o Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
