import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Loader2 } from "lucide-react";
import {
  useMyEventRating,
  useSubmitEventRating,
  useUpdateEventRating,
} from "@/hooks/useEventRatings";
import { cn } from "@/lib/utils";

interface EventRatingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
}

const aspectLabels = {
  organization: "Organização",
  venue: "Local",
  attendees: "Participantes",
};

export function EventRatingModal({
  open,
  onOpenChange,
  eventId,
  eventTitle,
}: EventRatingModalProps) {
  const { data: existingRating, isLoading: loadingRating } = useMyEventRating(eventId);
  const submitRating = useSubmitEventRating();
  const updateRating = useUpdateEventRating();

  const [rating, setRating] = useState(existingRating?.rating || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState(existingRating?.feedback || "");
  const [aspects, setAspects] = useState<Record<string, number>>({
    organization: existingRating?.aspects?.organization || 0,
    venue: existingRating?.aspects?.venue || 0,
    attendees: existingRating?.aspects?.attendees || 0,
  });

  // Update form when existing rating loads
  useState(() => {
    if (existingRating) {
      setRating(existingRating.rating);
      setFeedback(existingRating.feedback || "");
      setAspects({
        organization: existingRating.aspects?.organization || 0,
        venue: existingRating.aspects?.venue || 0,
        attendees: existingRating.aspects?.attendees || 0,
      });
    }
  });

  const handleSubmit = async () => {
    if (rating === 0) return;

    const aspectsData = Object.fromEntries(
      Object.entries(aspects).filter(([_, v]) => v > 0)
    ) as { organization?: number; venue?: number; attendees?: number };

    if (existingRating) {
      await updateRating.mutateAsync({
        ratingId: existingRating.id,
        eventId,
        rating,
        feedback: feedback.trim() || undefined,
        aspects: aspectsData,
      });
    } else {
      await submitRating.mutateAsync({
        eventId,
        rating,
        feedback: feedback.trim() || undefined,
        aspects: aspectsData,
      });
    }

    onOpenChange(false);
  };

  const isPending = submitRating.isPending || updateRating.isPending;

  const renderStars = (
    value: number,
    onChange: (v: number) => void,
    hover?: number,
    onHover?: (v: number) => void,
    size: "lg" | "sm" = "lg"
  ) => {
    const starSize = size === "lg" ? "h-8 w-8" : "h-5 w-5";
    const displayValue = hover || value;

    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="focus:outline-none"
            onClick={() => onChange(star)}
            onMouseEnter={() => onHover?.(star)}
            onMouseLeave={() => onHover?.(0)}
          >
            <Star
              className={cn(
                starSize,
                "transition-colors",
                star <= displayValue
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/30"
              )}
            />
          </button>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
            Avaliar Evento
          </DialogTitle>
          <DialogDescription>{eventTitle}</DialogDescription>
        </DialogHeader>

        {loadingRating ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Main Rating */}
            <div className="text-center space-y-2">
              <Label>Como foi sua experiência geral?</Label>
              <div className="flex justify-center">
                {renderStars(rating, setRating, hoverRating, setHoverRating)}
              </div>
              <p className="text-sm text-muted-foreground">
                {rating === 0
                  ? "Toque nas estrelas para avaliar"
                  : rating === 5
                  ? "Excelente! 🎉"
                  : rating >= 4
                  ? "Muito bom! 👍"
                  : rating >= 3
                  ? "Bom 👌"
                  : rating >= 2
                  ? "Regular 😐"
                  : "Ruim 😕"}
              </p>
            </div>

            {/* Aspect Ratings */}
            <div className="space-y-3">
              <Label className="text-muted-foreground">
                Avalie aspectos específicos (opcional)
              </Label>
              {Object.entries(aspectLabels).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-sm">{label}</span>
                  {renderStars(
                    aspects[key] || 0,
                    (v) => setAspects((prev) => ({ ...prev, [key]: v })),
                    undefined,
                    undefined,
                    "sm"
                  )}
                </div>
              ))}
            </div>

            {/* Feedback */}
            <div className="space-y-2">
              <Label htmlFor="feedback">Comentário (opcional)</Label>
              <Textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Compartilhe sua experiência..."
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {feedback.length}/500
              </p>
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={rating === 0 || isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Star className="h-4 w-4 mr-2" />
              )}
              {existingRating ? "Atualizar Avaliação" : "Enviar Avaliação"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
