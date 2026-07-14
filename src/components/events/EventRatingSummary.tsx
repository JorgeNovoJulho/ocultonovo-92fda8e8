import { Star, Users, Building2, MapPin } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { calculateRatingSummary, type EventRating } from "@/hooks/useEventRatings";

interface EventRatingSummaryProps {
  ratings: EventRating[];
  compact?: boolean;
}

export function EventRatingSummary({ ratings, compact = false }: EventRatingSummaryProps) {
  const summary = calculateRatingSummary(ratings);

  if (summary.total === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhuma avaliação ainda</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          <span className="font-semibold">{summary.average.toFixed(1)}</span>
        </div>
        <span className="text-muted-foreground text-sm">
          ({summary.total} {summary.total === 1 ? "avaliação" : "avaliações"})
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Rating */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-4xl font-bold">{summary.average.toFixed(1)}</div>
          <div className="flex justify-center mt-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(
                  "h-4 w-4",
                  star <= Math.round(summary.average)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/30"
                )}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {summary.total} {summary.total === 1 ? "avaliação" : "avaliações"}
          </p>
        </div>

        {/* Distribution */}
        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.distribution[star] || 0;
            const percentage = summary.total > 0 ? (count / summary.total) * 100 : 0;

            return (
              <div key={star} className="flex items-center gap-2 text-sm">
                <span className="w-3">{star}</span>
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                <Progress value={percentage} className="h-2 flex-1" />
                <span className="w-6 text-right text-muted-foreground">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Aspect Ratings */}
      {(summary.aspects.organization || summary.aspects.venue || summary.aspects.attendees) && (
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">
            Avaliações por Aspecto
          </h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            {summary.aspects.organization && (
              <div className="space-y-1">
                <Building2 className="h-5 w-5 mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Organização</p>
                <div className="flex items-center justify-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">
                    {summary.aspects.organization.toFixed(1)}
                  </span>
                </div>
              </div>
            )}
            {summary.aspects.venue && (
              <div className="space-y-1">
                <MapPin className="h-5 w-5 mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Local</p>
                <div className="flex items-center justify-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">
                    {summary.aspects.venue.toFixed(1)}
                  </span>
                </div>
              </div>
            )}
            {summary.aspects.attendees && (
              <div className="space-y-1">
                <Users className="h-5 w-5 mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Participantes</p>
                <div className="flex items-center justify-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">
                    {summary.aspects.attendees.toFixed(1)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
