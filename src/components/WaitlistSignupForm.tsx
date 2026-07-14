import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, User, Clock, Users, Sparkles, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddToWaitlist } from '@/hooks/useWaitlist';
import { useCanSignup } from '@/hooks/useCapacityMetrics';
import { Logo } from '@/components/Logo';
import { Link } from 'react-router-dom';

interface WaitlistSignupFormProps {
  onSuccess?: (position: number) => void;
  onBack?: () => void;
  showBackButton?: boolean;
}

export function WaitlistSignupForm({ onSuccess, onBack, showBackButton = false }: WaitlistSignupFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { data: capacityInfo } = useCanSignup();
  const addToWaitlist = useAddToWaitlist();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) return;

    try {
      const result = await addToWaitlist.mutateAsync({
        email,
        name: name || undefined,
        source: 'signup',
      });

      setPosition(result.position);
      setIsSubmitted(true);
      onSuccess?.(result.position);
    } catch (error) {
      console.error('Waitlist error:', error);
    }
  };

  if (isSubmitted && position) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 p-4"
      >
        <div className="w-full max-w-md text-center space-y-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="text-6xl mb-4"
          >
            🎉
          </motion.div>
          
          <h1 className="text-3xl font-bold text-foreground">
            Você está na fila!
          </h1>
          
          <div className="p-6 bg-card rounded-xl border border-primary/20 shadow-lg">
            <p className="text-muted-foreground mb-4">Sua posição atual:</p>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.4 }}
              className="text-6xl font-black text-primary"
            >
              #{position}
            </motion.div>
          </div>
          
          <p className="text-muted-foreground">
            Avisaremos você por email assim que houver uma vaga disponível.
          </p>
          
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{capacityInfo?.waitlistCount || 0} pessoas na fila</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {showBackButton && onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        )}

        <div className="text-center mb-8">
          <Logo className="mx-auto mb-6" />
          
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-full mb-4"
          >
            <Clock className="w-4 h-4" />
            <span className="font-medium">Vagas Esgotadas</span>
          </motion.div>
          
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Entre na Lista de Espera
          </h1>
          
          <p className="text-muted-foreground">
            Seja o primeiro a saber quando novas vagas estiverem disponíveis!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-6 bg-card/80 backdrop-blur-sm rounded-xl border border-border shadow-lg space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                Email *
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Nome (opcional)
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background"
              />
            </div>

            <Button
              type="submit"
              disabled={addToWaitlist.isPending || !email}
              className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-pink-600 hover:from-primary/90 hover:to-pink-600/90"
            >
              {addToWaitlist.isPending ? (
                'Entrando na fila...'
              ) : (
                <>
                  Entrar na Lista de Espera
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{capacityInfo?.waitlistCount || 0} na fila</span>
            </div>
            <div className="flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>Vagas exclusivas</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
