import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Send, 
  Search, 
  User, 
  Loader2, 
  Crown,
  Check,
  X
} from "lucide-react";
import { useFollowers } from "@/hooks/useFollows";
import { useProfile } from "@/hooks/useProfile";
import { useSendInvite, useSentInvites } from "@/hooks/useEventInvites";
import { cn } from "@/lib/utils";

interface SendInvitesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
}

export function SendInvitesModal({
  open,
  onOpenChange,
  eventId,
  eventTitle,
}: SendInvitesModalProps) {
  const { profile } = useProfile();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const { data: followers, isLoading: loadingFollowers } = useFollowers(profile?.id);
  const { data: sentInvites } = useSentInvites(eventId);
  const sendInvite = useSendInvite();

  // IDs of followers who already received an invite
  const alreadyInvitedIds = new Set(sentInvites?.map((i) => i.recipient_id) || []);

  // Filter followers by search
  const filteredFollowers = (followers || []).filter((f) =>
    f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelection = (id: string) => {
    if (alreadyInvitedIds.has(id)) return;
    
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    const eligibleIds = filteredFollowers
      .filter((f) => !alreadyInvitedIds.has(f.id))
      .map((f) => f.id);
    setSelectedIds(eligibleIds);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleSend = async () => {
    if (selectedIds.length === 0) return;

    await sendInvite.mutateAsync({
      eventId,
      recipientIds: selectedIds,
      message: message || undefined,
    });

    setSelectedIds([]);
    setMessage("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-[hsl(45,93%,47%)]" />
            Enviar Convites VIP
          </DialogTitle>
          <DialogDescription>
            Selecione seguidores para convidar para "{eventTitle}"
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar seguidores..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Selection Actions */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selectedIds.length} selecionado(s)
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Selecionar todos
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Limpar
            </Button>
          </div>
        </div>

        {/* Followers List */}
        <ScrollArea className="flex-1 min-h-[200px] max-h-[300px] border rounded-lg">
          {loadingFollowers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFollowers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhum seguidor encontrado</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredFollowers.map((follower) => {
                const isSelected = selectedIds.includes(follower.id);
                const alreadyInvited = alreadyInvitedIds.has(follower.id);
                const invite = sentInvites?.find((i) => i.recipient_id === follower.id);

                return (
                  <div
                    key={follower.id}
                    onClick={() => toggleSelection(follower.id)}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all",
                      isSelected && "bg-primary/10 border border-primary/30",
                      !isSelected && !alreadyInvited && "hover:bg-muted/50",
                      alreadyInvited && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={alreadyInvited}
                      className="pointer-events-none"
                    />
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={follower.avatar_url || ""} />
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        @{follower.username || "usuário"}
                      </p>
                    </div>
                    {alreadyInvited && (
                      <Badge
                        variant={invite?.status === "accepted" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {invite?.status === "accepted" && <Check className="h-3 w-3 mr-1" />}
                        {invite?.status === "declined" && <X className="h-3 w-3 mr-1" />}
                        {invite?.status === "pending"
                          ? "Pendente"
                          : invite?.status === "accepted"
                          ? "Aceito"
                          : "Recusado"}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Message */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Mensagem (opcional)</label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Adicione uma mensagem personalizada ao convite..."
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="flex-1 gap-2 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)]"
            onClick={handleSend}
            disabled={selectedIds.length === 0 || sendInvite.isPending}
          >
            {sendInvite.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar {selectedIds.length > 0 && `(${selectedIds.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
