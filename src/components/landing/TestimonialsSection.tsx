import { Badge } from "@/components/ui/badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Heart, Star, Users, Sparkles, Quote } from "lucide-react";

interface Testimonial {
  id: string;
  name: string;
  type: "creator" | "couple" | "subscriber";
  avatar: string;
  quote: string;
  highlight: string;
  badge?: string;
}

const testimonials: Testimonial[] = [
  {
    id: "1",
    type: "couple",
    name: "Lucas & Marina",
    avatar: "https://images.unsplash.com/photo-1522556189639-b150ed9c4330?w=150&h=150&fit=crop&crop=faces",
    quote: "Encontramos casais incríveis na nossa cidade. A privacidade nos deu confiança para explorar nossos desejos juntos.",
    highlight: "3 encontros realizados",
    badge: "Casal Verificado",
  },
  {
    id: "2",
    type: "creator",
    name: "Valentina",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=faces",
    quote: "Em 3 meses consegui uma renda extra significativa. Os fãs aqui são respeitosos e valorizam meu trabalho.",
    highlight: "R$ 12.000+ em 90 dias",
    badge: "Top Creator",
  },
  {
    id: "3",
    type: "subscriber",
    name: "Ricardo",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=faces",
    quote: "O Radar mudou tudo. Conheci pessoas reais, sem fake, que buscam o mesmo que eu.",
    highlight: "5 matches compatíveis",
    badge: "Premium",
  },
  {
    id: "4",
    type: "couple",
    name: "Bruno & Camila",
    avatar: "https://images.unsplash.com/photo-1516914943479-89db7d9ae7f2?w=150&h=150&fit=crop&crop=faces",
    quote: "A verificação de casais nos deixou seguros. Aqui encontramos pessoas reais com os mesmos interesses.",
    highlight: "8 meses na plataforma",
    badge: "Casal Verificado",
  },
  {
    id: "5",
    type: "creator",
    name: "Isabella",
    avatar: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&h=150&fit=crop&crop=faces",
    quote: "Liberdade para criar conteúdo sem censura excessiva. Meus assinantes adoram o conteúdo exclusivo.",
    highlight: "+500 assinantes",
    badge: "Criadora VIP",
  },
  {
    id: "6",
    type: "subscriber",
    name: "Fernando",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=faces",
    quote: "Diferente de outros apps, aqui as pessoas são abertas e diretas sobre o que buscam. Isso facilita tudo.",
    highlight: "VIP há 6 meses",
    badge: "VIP",
  },
];

const typeConfig = {
  creator: {
    icon: Star,
    color: "from-amber-500 to-orange-500",
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-400",
    borderColor: "border-amber-500/30",
  },
  couple: {
    icon: Heart,
    color: "from-pink-500 to-rose-500",
    bgColor: "bg-pink-500/10",
    textColor: "text-pink-400",
    borderColor: "border-pink-500/30",
  },
  subscriber: {
    icon: Users,
    color: "from-primary to-secondary",
    bgColor: "bg-primary/10",
    textColor: "text-primary",
    borderColor: "border-primary/30",
  },
};

interface TestimonialsSectionProps {
  content?: {
    badge?: string;
    title?: string;
    subtitle?: string;
  };
}

export function TestimonialsSection({ content }: TestimonialsSectionProps) {
  return (
    <section className="py-20 sm:py-28 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/30 px-4 py-1.5">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {content?.badge || "Histórias Reais"}
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            {content?.title || (
              <>
                O que dizem sobre o{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                  OCULTO
                </span>
              </>
            )}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {content?.subtitle || "Depoimentos de quem já vive essa experiência"}
          </p>
        </div>

        {/* Carousel */}
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          className="max-w-6xl mx-auto"
        >
          <CarouselContent className="-ml-4">
            {testimonials.map((testimonial) => {
              const config = typeConfig[testimonial.type];
              const IconComponent = config.icon;

              return (
                <CarouselItem
                  key={testimonial.id}
                  className="pl-4 md:basis-1/2 lg:basis-1/3"
                >
                  <div className="relative h-full p-6 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-all duration-300 group">
                    {/* Quote icon */}
                    <Quote className="absolute top-4 right-4 w-8 h-8 text-primary/10 group-hover:text-primary/20 transition-colors" />

                    {/* Avatar and info */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`relative w-14 h-14 rounded-full p-[2px] bg-gradient-to-br ${config.color}`}>
                        <img loading="lazy" decoding="async"
                          src={testimonial.avatar}
                          alt={testimonial.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">
                          {testimonial.name}
                        </h4>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${config.bgColor} ${config.textColor} ${config.borderColor}`}
                        >
                          <IconComponent className="w-3 h-3 mr-1" />
                          {testimonial.badge}
                        </Badge>
                      </div>
                    </div>

                    {/* Quote */}
                    <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                      "{testimonial.quote}"
                    </p>

                    {/* Highlight */}
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor}`}>
                      <Sparkles className={`w-3.5 h-3.5 ${config.textColor}`} />
                      <span className={`text-xs font-medium ${config.textColor}`}>
                        {testimonial.highlight}
                      </span>
                    </div>
                  </div>
                </CarouselItem>
              );
            })}
          </CarouselContent>
          <CarouselPrevious className="hidden sm:flex -left-4 bg-card/80 border-border/50 hover:bg-card" />
          <CarouselNext className="hidden sm:flex -right-4 bg-card/80 border-border/50 hover:bg-card" />
        </Carousel>

        {/* Mobile indicator dots */}
        <div className="flex justify-center gap-2 mt-6 sm:hidden">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${i === 0 ? "bg-primary" : "bg-primary/30"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
