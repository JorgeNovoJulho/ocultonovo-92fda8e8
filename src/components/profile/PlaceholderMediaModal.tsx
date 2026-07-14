import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageIcon, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  needsAvatar: boolean;
  needsCover: boolean;
}

export default function PlaceholderMediaModal({ open, onClose, needsAvatar, needsCover }: Props) {
  const navigate = useNavigate();

  const itens: string[] = [];
  if (needsAvatar) itens.push("foto de perfil");
  if (needsCover) itens.push("banner");
  const lista = itens.length > 1 ? `${itens[0]} e ${itens[1]}` : itens[0];

  const handleEdit = () => {
    onClose();
    navigate("/settings");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Personalize seu perfil</DialogTitle>
          <DialogDescription className="text-center">
            Você está usando uma <strong>{lista} temporária</strong> escolhida automaticamente
            com base no seu perfil. Você pode trocar a qualquer momento nas configurações.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <ImageIcon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <p>
            Perfis com foto e banner próprios recebem mais visitas, matches e curtidas. Esse
            aviso continua aparecendo a cada login até você personalizar.
          </p>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Mais tarde
          </Button>
          <Button onClick={handleEdit}>Personalizar agora</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
