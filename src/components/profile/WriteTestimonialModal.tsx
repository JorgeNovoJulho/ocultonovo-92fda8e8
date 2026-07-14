import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useProfileTestimonials } from "@/hooks/useProfileTestimonials";

interface Props {
  open: boolean;
  onClose: () => void;
  targetProfileId: string;
  displayHandle: string;
}

const MAX = 250;

export function WriteTestimonialModal({ open, onClose, targetProfileId, displayHandle }: Props) {
  const { create } = useProfileTestimonials(targetProfileId);
  const [text, setText] = useState("");

  const handleSubmit = async () => {
    try {
      await create.mutateAsync(text);
      setText("");
      onClose();
    } catch {
      /* toast no hook */
    }
  };

  const remaining = MAX - text.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Escrever depoimento</DialogTitle>
          <DialogDescription>
            Compartilhe sua experiência com {displayHandle}. Até {MAX} caracteres.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            placeholder="Escreva algo respeitoso e verdadeiro..."
            rows={5}
            maxLength={MAX}
          />
          <div className="text-right text-xs text-muted-foreground">{remaining} restantes</div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!text.trim() || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
