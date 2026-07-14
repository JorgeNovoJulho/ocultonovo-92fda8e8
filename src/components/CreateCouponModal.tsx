import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Ticket, Percent, Tag, AlertCircle, CheckCircle2, Instagram, Smartphone, Twitter, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export type PlatformSource = 'instagram' | 'tiktok' | 'twitter' | 'other';

export interface Coupon {
  id: string;
  campaignName: string;
  code: string;
  discount: number;
  startDate: Date;
  endDate: Date;
  uses: number;
  isActive: boolean;
  createdAt: Date;
  platformSource?: PlatformSource;
}

const platformOptions: { value: PlatformSource; label: string; icon: React.ReactNode }[] = [
  { value: 'instagram', label: 'Instagram', icon: <Instagram className="h-4 w-4" /> },
  { value: 'tiktok', label: 'TikTok', icon: <Smartphone className="h-4 w-4" /> },
  { value: 'twitter', label: 'Twitter/X', icon: <Twitter className="h-4 w-4" /> },
  { value: 'other', label: 'Outro', icon: <Globe className="h-4 w-4" /> },
];

interface CreateCouponModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateCoupon: (coupon: Omit<Coupon, 'id' | 'uses' | 'createdAt'>) => void;
  basePrice?: number;
}

export function CreateCouponModal({
  open,
  onOpenChange,
  onCreateCoupon,
  basePrice = 29.90,
}: CreateCouponModalProps) {
  const [campaignName, setCampaignName] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState([15]);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [platformSource, setPlatformSource] = useState<PlatformSource>('instagram');

  const PLATFORM_FEE_RATE = 0.20;

  const finalPrice = basePrice * (1 - discount[0] / 100);
  const platformFee = finalPrice * PLATFORM_FEE_RATE;
  const creatorNet = finalPrice - platformFee;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleSubmit = () => {
    if (!campaignName.trim() || !couponCode.trim() || !startDate || !endDate) {
      toast({
        title: "Preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    if (endDate < startDate) {
      toast({
        title: "Data inválida",
        description: "A data de término deve ser posterior à data de início.",
        variant: "destructive",
      });
      return;
    }

    onCreateCoupon({
      campaignName: campaignName.trim(),
      code: couponCode.toUpperCase().trim(),
      discount: discount[0],
      startDate,
      endDate,
      isActive: true,
      platformSource,
    });

    // Reset form
    setCampaignName("");
    setCouponCode("");
    setDiscount([15]);
    setStartDate(undefined);
    setEndDate(undefined);
    setPlatformSource('instagram');

    toast({
      title: "Cupom criado! 🎉",
      description: `O cupom ${couponCode.toUpperCase()} está ativo.`,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Criar Novo Cupom Promocional
          </DialogTitle>
          <DialogDescription>
            Configure uma campanha promocional para seus assinantes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Campaign Name */}
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Nome da Campanha</Label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="campaign-name"
                placeholder="Ex: Black Friday, Natal, Aniversário..."
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="bg-muted/30 border-border/50 pl-10"
                maxLength={50}
              />
            </div>
          </div>

          {/* Coupon Code */}
          <div className="space-y-2">
            <Label htmlFor="coupon-code">Código do Cupom</Label>
            <div className="relative">
              <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="coupon-code"
                placeholder="Ex: NATAL30, BLACKFRIDAY..."
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                className="bg-muted/30 border-border/50 pl-10 font-mono uppercase"
                maxLength={20}
              />
            </div>
          </div>

          {/* Platform Source Selector */}
          <div className="space-y-2">
            <Label>Origem da Campanha</Label>
            <Select value={platformSource} onValueChange={(v) => setPlatformSource(v as PlatformSource)}>
              <SelectTrigger className="bg-muted/30 border-border/50">
                <SelectValue placeholder="Selecione a plataforma" />
              </SelectTrigger>
              <SelectContent>
                {platformOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      {option.icon}
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Rastreie de onde vêm seus assinantes para otimizar seu marketing
            </p>
          </div>

          {/* Discount Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Desconto</Label>
              <span className="text-lg font-bold text-primary">
                <Percent className="h-4 w-4 inline mr-1" />
                {discount[0]}%
              </span>
            </div>
            <Slider
              value={discount}
              onValueChange={setDiscount}
              min={5}
              max={50}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5%</span>
              <span>50%</span>
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-muted/30 border-border/50",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Data de Término</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-muted/30 border-border/50",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) => date < (startDate || new Date())}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Price Simulation */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Simulação de Preço</span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Preço base:</span>
                <span className="line-through text-muted-foreground">{formatCurrency(basePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Preço com desconto ({discount[0]}%):</span>
                <span className="font-bold text-[hsl(142,76%,36%)]">{formatCurrency(finalPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa da plataforma (20%):</span>
                <span className="text-destructive">-{formatCurrency(platformFee)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border/30">
                <span className="font-medium">Você recebe:</span>
                <span className="font-bold text-primary">{formatCurrency(creatorNet)}</span>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(45,93%,47%)]" />
            <p>A taxa da plataforma (20%) incide sobre o valor final da transação após o desconto.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!campaignName || !couponCode || !startDate || !endDate}
            className="flex-1 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
          >
            <Ticket className="h-4 w-4 mr-2" />
            Criar Cupom
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
