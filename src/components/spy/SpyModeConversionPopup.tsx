import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Bookmark, Send, UserPlus, Lock, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { useNavigate } from 'react-router-dom';

export type ConversionAction = 'like' | 'comment' | 'save' | 'message' | 'follow' | 'general';

interface SpyModeConversionPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: ConversionAction;
}

const actionConfig: Record<ConversionAction, {
  icon: typeof Heart;
  title: string;
  subtitle: string;
  emoji: string;
}> = {
  like: {
    icon: Heart,
    title: 'Curtir esse conteúdo?',
    subtitle: 'Crie uma conta para curtir posts e mostrar seu interesse!',
    emoji: '❤️',
  },
  comment: {
    icon: MessageCircle,
    title: 'Quer comentar?',
    subtitle: 'Crie uma conta para participar das conversas!',
    emoji: '💬',
  },
  save: {
    icon: Bookmark,
    title: 'Salvar para depois?',
    subtitle: 'Crie uma conta para guardar seus posts favoritos!',
    emoji: '🔖',
  },
  message: {
    icon: Send,
    title: 'Quer enviar uma mensagem?',
    subtitle: 'Crie uma conta para conversar com criadores!',
    emoji: '✉️',
  },
  follow: {
    icon: UserPlus,
    title: 'Quer seguir esse perfil?',
    subtitle: 'Crie uma conta para não perder nenhum conteúdo!',
    emoji: '👀',
  },
  general: {
    icon: Lock,
    title: 'Ops! Essa ação requer uma conta',
    subtitle: 'Cadastre-se gratuitamente para acessar todos os recursos!',
    emoji: '🔐',
  },
};

export function SpyModeConversionPopup({ 
  open, 
  onOpenChange, 
  action 
}: SpyModeConversionPopupProps) {
  const navigate = useNavigate();
  const config = actionConfig[action];
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden bg-card border-primary/30">
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
        {/* Header com gradiente */}
        <div className="relative bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10 p-6 text-center">
          {/* Partículas decorativas */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-primary/30"
                initial={{ 
                  x: Math.random() * 200, 
                  y: Math.random() * 100,
                  scale: 0 
                }}
                animate={{ 
                  scale: [0, 1, 0],
                  y: [0, -20, 0],
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.3,
                  repeat: Infinity,
                }}
              />
            ))}
          </motion.div>

          {/* Ícone principal */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 15, delay: 0.1 }}
            className="relative inline-block"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/30">
              <Icon className="w-10 h-10 text-white" />
            </div>
            
            {/* Emoji flutuante */}
            <motion.span
              initial={{ scale: 0, y: 0 }}
              animate={{ scale: 1, y: -5 }}
              transition={{ delay: 0.3, type: 'spring' }}
              className="absolute -top-2 -right-2 text-2xl"
            >
              {config.emoji}
            </motion.span>
          </motion.div>

          {/* Textos */}
          <motion.h3
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl font-bold text-foreground mb-2"
          >
            {config.title}
          </motion.h3>
          
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground text-sm"
          >
            {config.subtitle}
          </motion.p>
        </div>

        {/* Benefícios */}
        <div className="px-6 py-4 space-y-3">
          <div className="text-xs text-muted-foreground text-center mb-3">
            Ao criar uma conta você terá acesso a:
          </div>
          
          {[
            { icon: Heart, text: 'Curtir e salvar posts favoritos' },
            { icon: MessageCircle, text: 'Conversar com criadores' },
            { icon: Sparkles, text: 'Conteúdo exclusivo ilimitado' },
          ].map((benefit, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="flex items-center gap-3 text-sm"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <benefit.icon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-muted-foreground">{benefit.text}</span>
            </motion.div>
          ))}
        </div>

        {/* Botões de ação */}
        <div className="p-6 pt-2 space-y-3">
          <Button
            onClick={() => navigate('/signup')}
            className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white font-semibold py-6"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Criar Conta Grátis
          </Button>
          
          <Button
            onClick={() => navigate('/login')}
            variant="outline"
            className="w-full"
          >
            Já tenho uma conta
          </Button>

          <button
            onClick={() => onOpenChange(false)}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Continuar explorando como visitante
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
