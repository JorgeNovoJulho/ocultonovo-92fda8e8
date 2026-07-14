import {
  Crown,
  DollarSign,
  Sparkles,
  MessageCircle,
  Compass,
  Notebook,
  ShieldCheck,
  Radar,
  Heart,
  Eye,
  Zap,
  Lock,
  LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BoltMark, RingsMark } from "./decor/Patterns";
import {
  DEFAULT_UNIVERSE_GRID,
  UniverseGridContent,
} from "@/hooks/useLandingSectionsContent";

const ICONS: Record<string, LucideIcon> = {
  Crown,
  DollarSign,
  Sparkles,
  MessageCircle,
  Compass,
  Notebook,
  ShieldCheck,
  Radar,
  Heart,
  Eye,
  Zap,
  Lock,
};

interface Props {
  content?: Partial<UniverseGridContent>;
}

export function UniverseGridSection({ content }: Props) {
  const data: UniverseGridContent = { ...DEFAULT_UNIVERSE_GRID, ...(content || {}) };
  const cards = (data.cards || []).filter((c) => c.visible !== false);

  return (
    <section className="relative z-10 py-20 sm:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.04] to-transparent pointer-events-none" />
      <div className="hidden md:block pointer-events-none absolute inset-0 opacity-[0.08]">
        <BoltMark className="absolute top-10 right-10 text-primary" size={120} />
        <RingsMark className="absolute bottom-10 left-10 text-secondary" size={200} />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <Badge className="mb-4 bg-gradient-to-r from-primary/20 to-secondary/20 text-primary border-primary/30 px-4 py-1.5">
            ✦ {data.badge}
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">{data.title}</h2>
          <p className="text-base sm:text-lg text-muted-foreground">{data.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {cards.map((card, i) => {
            const Icon = ICONS[card.icon] || Sparkles;
            return (
              <article
                key={i}
                className={`group relative p-5 sm:p-6 rounded-2xl bg-card/50 backdrop-blur-sm border transition-all hover:translate-y-[-4px] ${
                  card.vip
                    ? "border-amber-400/40 hover:border-amber-400/70 hover:shadow-[0_0_30px_rgba(250,204,21,0.15)]"
                    : "border-border/40 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(255,0,127,0.1)]"
                }`}
              >
                {card.vip && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400/20 to-amber-500/20 text-amber-300 border border-amber-400/40">
                    VIP
                  </span>
                )}

                <div
                  className={`w-11 h-11 rounded-lg flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${
                    card.vip
                      ? "bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-300"
                      : "bg-gradient-to-br from-primary/20 to-secondary/10 text-primary"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <h3 className="text-base sm:text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {card.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
