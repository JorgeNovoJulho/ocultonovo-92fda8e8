import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

interface CTAContent {
  title?: string;
  cta?: string;
  cta_link?: string;
}

interface CTASectionProps {
  content: CTAContent;
}

export function CTASection({ content }: CTASectionProps) {
  return (
    <section className="py-16 sm:py-20 lg:py-24 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FF007F]/10 to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#FF007F]/20 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-6 sm:mb-8">
            {content.title || 'Pronto para descobrir o que está oculto?'}
          </h2>
          
          <Link to={content.cta_link || '/signup'}>
            <Button 
              size="lg"
              className="bg-[#FF007F] hover:bg-[#FF007F]/90 text-white font-bold px-8 sm:px-12 py-6 sm:py-8 text-base sm:text-lg shadow-lg shadow-[#FF007F]/25 hover:shadow-[#FF007F]/40 transition-all group"
            >
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />
              {content.cta || 'Criar Conta Grátis'}
              <ArrowRight className="h-5 w-5 sm:h-6 sm:w-6 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
