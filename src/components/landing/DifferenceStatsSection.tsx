import { Badge } from "@/components/ui/badge";
import { AsteriskMark } from "./decor/Patterns";
import {
  DEFAULT_DIFFERENCE_STATS,
  DifferenceStatsContent,
} from "@/hooks/useLandingSectionsContent";

interface Props {
  content?: Partial<DifferenceStatsContent>;
}

export function DifferenceStatsSection({ content }: Props) {
  const data: DifferenceStatsContent = { ...DEFAULT_DIFFERENCE_STATS, ...(content || {}) };

  return (
    <section className="relative z-10 py-20 sm:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.06] via-background to-transparent pointer-events-none" />
      <div className="hidden md:block pointer-events-none absolute -top-16 right-10 opacity-[0.08]">
        <AsteriskMark className="text-primary" size={260} />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Badge className="mb-4 bg-secondary/15 text-secondary-foreground border-secondary/30 px-4 py-1.5">
            ✦ {data.badge}
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">{data.title}</h2>
          <p className="text-base sm:text-lg text-muted-foreground">{data.subtitle}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5 max-w-4xl mx-auto mb-10">
          {data.stats.map((s, i) => (
            <div
              key={i}
              className="text-center p-5 sm:p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/40 hover:border-primary/50 transition-all"
            >
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent mb-1">
                {s.value}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wider">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
          {data.badges.map((b, i) => (
            <span
              key={i}
              className="px-4 py-2 text-xs sm:text-sm rounded-full bg-card/60 border border-border/50 text-foreground/90"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
