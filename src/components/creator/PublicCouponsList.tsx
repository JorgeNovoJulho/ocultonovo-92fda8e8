import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ticket, Copy } from "lucide-react";
import { useActiveCreatorCoupons } from "@/hooks/useCreatorCoupons";
import { toast } from "sonner";

interface Props { creatorId: string }

export default function PublicCouponsList({ creatorId }: Props) {
  const { data: coupons = [], isLoading } = useActiveCreatorCoupons(creatorId);
  if (isLoading || coupons.length === 0) return null;

  const copy = (code: string) => {
    navigator.clipboard?.writeText(code);
    toast.success(`Cupom ${code} copiado`);
  };

  return (
    <Card className="p-4 space-y-2 border-pink-500/30 bg-pink-500/5">
      <div className="flex items-center gap-2">
        <Ticket className="h-5 w-5 text-pink-400" />
        <h3 className="font-bold">Cupons disponíveis</h3>
      </div>
      <div className="space-y-1.5">
        {coupons.map((c) => {
          const remaining = c.max_uses - c.uses_count;
          return (
            <div key={c.id} className="rounded-md border border-pink-500/30 bg-pink-500/10 p-2 flex items-center gap-2">
              <code className="text-xs font-bold text-pink-200 flex-1 truncate">{c.code}</code>
              <Badge className="bg-pink-500/40 text-pink-100 text-[10px]">{c.discount_percent}% OFF</Badge>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(c.code)}>
                <Copy className="h-3 w-3" />
              </Button>
              <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                {remaining} rest. · até {new Date(c.valid_until).toLocaleDateString("pt-BR")}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">Use o código no checkout. Cada cupom pode ser usado uma vez por usuário.</p>
    </Card>
  );
}
