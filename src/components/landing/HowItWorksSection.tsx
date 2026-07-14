import {
  UserPlus,
  Sparkles,
  ShieldCheck,
  Heart,
  Eye,
  Zap,
  Radar,
  Compass,
  LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AsteriskMark, DotGrid } from "./decor/Patterns";
import {
  DEFAULT_HOW_IT_WORKS,
  HowItWorksContent,
} from "@/hooks/useLandingSectionsContent";

const ICONS: Record<string, LucideIcon> = {
  UserPlus,
  Sparkles,
  ShieldCheck,
  Heart,
  Eye,
  Zap,
  Radar,
  Compass,
};

interface Props {
  content?: Partial<HowItWorksContent>;
}

export function HowItWorksSection({ content }: Props) {
  const data: HowItWorksContent = { ...DEFAULT_HOW_IT_WORKS, ...(content || {}) };

  return (
    <section className="relative z-10 py-20 sm:py-28 overflow-hidden">
      {/* Decorative patterns — desktop only */}
      <div className="hidden md:block pointer-events-none absolute inset-0 opacity-[0.07]">
        <AsteriskMark className="absolute -top-10 -left-10 text-primary" size={220} />
        <DotGrid className="absolute bottom-10 right-0 text-secondary" size={260} />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/30 px-4 py-1.5">
            {data.badge}
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            {data.title}
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">{data.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-8 max-w-5xl mx-auto">
          {data.steps.map((step, i) => {
            const Icon = ICONS[step.icon] || Sparkles;
            return (
              <div
                key={i}
                className="relative group p-6 sm:p-8 rounded-2xl bg-card/40 backdrop-blur-sm border border-border/40 hover:border-primary/50 transition-all"
              >
                {/* Step number */}
                <div className="absolute -top-4 -left-2 text-6xl sm:text-7xl font-black text-primary/15 leading-none select-none">
                  {String(i + 1).padStart(2, "0")}
                </div>

                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/25 to-secondary/15 flex items-center justify-center mb-5">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
