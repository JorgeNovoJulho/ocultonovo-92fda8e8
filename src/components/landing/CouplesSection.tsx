import { Badge } from '@/components/ui/badge';
import { Heart, Users, Sparkles } from 'lucide-react';
import { OnlineUsersCounter } from './OnlineUsersCounter';
import { VIPAccessButton } from './VIPAccessButton';

interface CouplesContent {
  badge?: string;
  title?: string;
  subtitle?: string;
  tags?: string[];
}

interface CouplesSectionProps {
  content: CouplesContent;
}

export function CouplesSection({ content }: CouplesSectionProps) {
  const tags = content.tags || [
    "Ménage", "Voyeur", "Soft Swing", "Full Swap", "Fetiche", "BDSM"
  ];

  return (
    <div className="container mx-auto px-4 sm:px-6 relative z-10">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        {/* Decorative top line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pink-500/50 to-transparent" />
        
        {/* Badge com ícones animados */}
        {content.badge && (
          <div className="flex justify-center animate-fade-in">
            <Badge 
              variant="outline" 
              className="border-pink-500/50 text-pink-400 bg-pink-500/10 px-5 py-2.5 text-sm font-medium backdrop-blur-sm shadow-[0_0_30px_rgba(236,72,153,0.25)] hover:shadow-[0_0_40px_rgba(236,72,153,0.4)] transition-shadow duration-500"
            >
              <Heart className="h-4 w-4 mr-2 fill-pink-400 animate-pulse" />
              <Users className="h-4 w-4 mr-2" />
              {content.badge}
              <Sparkles className="h-4 w-4 ml-2 text-pink-300" />
            </Badge>
          </div>
        )}
        
        {/* Título com gradiente animado */}
        <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-primary to-pink-500 animate-gradient-shift bg-[length:200%_200%]">
            {content.title || 'Conexões reais para casais'}
          </span>
        </h2>
        
        {/* Contador animado de usuários online */}
        <div className="flex justify-center animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <OnlineUsersCounter />
        </div>
        
        {/* Subtítulo */}
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {content.subtitle || 'Encontre outros casais e pessoas com os mesmos interesses. Perfis verificados, eventos exclusivos e a maior comunidade liberal do Brasil.'}
        </p>
        
        {/* Tags com efeito premium */}
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 pt-6">
          {tags.map((tag, index) => (
            <span
              key={index}
              className="px-5 py-2.5 rounded-full text-sm font-semibold 
                bg-gradient-to-r from-pink-500/15 to-primary/15 
                text-pink-300 
                border border-pink-500/40 
                hover:border-pink-400 
                hover:text-pink-200
                hover:shadow-[0_0_25px_rgba(236,72,153,0.35)] 
                hover:scale-105
                transition-all duration-300 
                cursor-default
                backdrop-blur-sm
                animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {tag}
            </span>
          ))}
        </div>
        
        {/* Botão de acesso VIP */}
        <VIPAccessButton />
        
        {/* Decorative bottom glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-pink-500/30 to-transparent" />
      </div>
    </div>
  );
}
