import { useEffect, useState } from "react";
import { Star, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProfileRating } from "@/hooks/useProfileRating";

interface Props {
  open: boolean;
  onClose: () => void;
  targetProfileId: string;
  displayHandle: string;
}

export function RateProfileModal({ open, onClose, targetProfileId, displayHandle }: Props) {
  const { data, submit } = useProfileRating(targetProfileId);
  const [stars, setStars] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);

  useEffect(() => {
    if (open) setStars(data?.my_stars ?? 0);
  }, [open, data?.my_stars]);

  const value = hover || stars;

  const handleSubmit = async () => {
    if (stars < 1) return;
    try {
      await submit.mutateAsync(stars);
      onClose();
    } catch {
      /* toast já no hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Avaliar o perfil</DialogTitle>
          <DialogDescription>
            Avalie {displayHandle} com uma nota de 1 a 5 estrelas, sendo 1 muito ruim e 5 muito bom.
            Sua avaliação ajuda a comunidade e gera pontos de reputação.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 py-8">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setStars(n)}
              className="transition-transform hover:scale-110 focus:outline-none"
              aria-label={`Dar ${n} estrelas`}
            >
              <Star
                className={cn(
                  "h-10 w-10 transition-colors",
                  n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>

        {data?.my_stars != null && (
          <p className="text-center text-xs text-muted-foreground -mt-4">
            Sua nota atual: {data.my_stars}/5 — você pode atualizar quando quiser.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={stars < 1 || submit.isPending}>
            {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
