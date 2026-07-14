import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Users } from 'lucide-react';

interface Stat {
  value: string;
  label: string;
}

interface CreatorsContent {
  badge?: string;
  title?: string;
  subtitle?: string;
  cta?: string;
  cta_link?: string;
  stats?: Stat[];
}

interface CreatorsSectionProps {
  content: CreatorsContent;
}

export function CreatorsSection({ content }: CreatorsSectionProps) {
  const stats = content.stats || [];

  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF007F]/5 via-transparent to-purple-500/5" />
      
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Text Content */}
          <div className="text-center lg:text-left">
            {content.badge && (
              <Badge 
                variant="outline" 
                className="border-[hsl(45,93%,47%)]/50 text-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10 px-3 py-1.5 text-xs sm:text-sm font-medium mb-4 sm:mb-6"
              >
                {content.badge}
              </Badge>
            )}
            
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6">
              {content.title || 'Transforme sua criatividade em renda'}
            </h2>
            
            <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8 max-w-xl mx-auto lg:mx-0">
              {content.subtitle || 'Crie conteúdo exclusivo, construa sua comunidade de fãs e receba pagamentos diretamente.'}
            </p>
            
            <Link to={content.cta_link || '/signup'}>
              <Button 
                size="lg"
                className="bg-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/90 text-black font-bold px-6 sm:px-8 py-5 sm:py-6 text-sm sm:text-base"
              >
                <DollarSign className="h-5 w-5 mr-2" />
                {content.cta || 'Começar como Criador'}
              </Button>
            </Link>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            {stats.map((stat, index) => (
              <div 
                key={index}
                className="text-center p-4 sm:p-6 rounded-2xl bg-card/50 border border-border/50"
              >
                <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-[hsl(45,93%,47%)] mb-1 sm:mb-2">
                  {stat.value}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
