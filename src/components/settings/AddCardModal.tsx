/**
 * AddCardModal — Modal para adicionar cartão de crédito (Settings)
 * Otimizado para Realme C55 (<4GB RAM)
 */
import { useState, memo } from "react";
import { CreditCard, Save, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseExternal";

interface AddCardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCardAdded?: () => void;
}

const detectBrand = (num: string) => {
  const n = num.replace(/\s/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^6(?:011|5)/.test(n)) return "Discover";
  if (/^(636368|438935|504175|451416|636297)/.test(n) || /^50[0-9]{1}/.test(n)) return "Elo";
  return "";
};

const formatCardNumber = (val: string) => {
  const digits = val.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
};

export const AddCardModal = memo(function AddCardModal({ open, onOpenChange, onCardAdded }: AddCardModalProps) {
  const { profile } = useProfile();
  const { toast } = useToast();

  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cardBrand, setCardBrand] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const currentYear = new Date().getFullYear();

  const handleCardNumberChange = (val: string) => {
    const formatted = formatCardNumber(val);
    setCardNumber(formatted);
    setCardBrand(detectBrand(formatted));
  };

  const resetForm = () => {
    setHolderName("");
    setCardNumber("");
    setExpiryMonth("");
    setExpiryYear("");
    setCardBrand("");
  };

  const handleSave = async () => {
    if (!profile?.id) {
      toast({ title: "Erro de autenticação", variant: "destructive" });
      return;
    }
    if (!holderName || cardNumber.replace(/\s/g, "").length < 13 || !expiryMonth || !expiryYear) {
      toast({ title: "Preencha todos os campos corretamente", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const lastFour = cardNumber.replace(/\s/g, "").slice(-4);

      // Check existing cards count for is_default
      const { data: existing } = await (supabase as any)
        .from("user_payment_cards")
        .select("id")
        .eq("user_id", profile.id);

      const { error } = await (supabase as any)
        .from("user_payment_cards")
        .insert({
          user_id: profile.id,
          card_holder_name: holderName.trim(),
          card_last_four: lastFour,
          card_brand: cardBrand || null,
          card_expiry_month: parseInt(expiryMonth),
          card_expiry_year: parseInt(expiryYear),
          is_default: !existing || existing.length === 0,
        });

      if (error) throw error;

      toast({ title: "✅ Cartão adicionado!", description: `****${lastFour} salvo com sucesso.` });
      resetForm();
      onOpenChange(false);
      onCardAdded?.();
    } catch (err: any) {
      toast({ title: "Erro ao salvar cartão", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Adicionar Cartão
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Nome no cartão */}
          <div className="space-y-1.5">
            <Label className="text-xs">Nome no Cartão</Label>
            <Input
              placeholder="NOME COMO NO CARTÃO"
              value={holderName}
              onChange={e => setHolderName(e.target.value.toUpperCase())}
              className="h-10 uppercase bg-muted/30 border-border/50"
              inputMode="text"
              autoComplete="cc-name"
            />
          </div>

          {/* Número do cartão */}
          <div className="space-y-1.5">
            <Label className="text-xs">Número do Cartão</Label>
            <div className="relative">
              <Input
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={e => handleCardNumberChange(e.target.value)}
                className="h-10 pr-20 bg-muted/30 border-border/50"
                maxLength={19}
                inputMode="numeric"
                autoComplete="cc-number"
              />
              {cardBrand && (
                <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]">
                  {cardBrand}
                </Badge>
              )}
            </div>
          </div>

          {/* Validade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mês</Label>
              <Select value={expiryMonth} onValueChange={setExpiryMonth}>
                <SelectTrigger className="h-10 bg-muted/30 border-border/50">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {String(i + 1).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ano</Label>
              <Select value={expiryYear} onValueChange={setExpiryYear}>
                <SelectTrigger className="h-10 bg-muted/30 border-border/50">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={currentYear + i} value={String(currentYear + i)}>
                      {currentYear + i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => { resetForm(); onOpenChange(false); }}
              className="flex-1"
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 gap-1.5"
            >
              {isSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                <><Save className="h-4 w-4" /> Salvar Cartão</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
