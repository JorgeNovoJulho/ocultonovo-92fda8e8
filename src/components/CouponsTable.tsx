import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Ticket, CheckCircle2, AlertCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Coupon } from "./CreateCouponModal";

interface CouponsTableProps {
  coupons: Coupon[];
  onToggleCoupon: (couponId: string, isActive: boolean) => void;
}

export function CouponsTable({ coupons, onToggleCoupon }: CouponsTableProps) {
  const isExpired = (endDate: Date): boolean => {
    return new Date(endDate) < new Date();
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'short' 
    });
  };

  if (coupons.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Ticket className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Nenhum cupom criado ainda</p>
        <p className="text-sm">Crie seu primeiro cupom promocional!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/30">
            <th className="text-left text-xs font-medium text-muted-foreground py-3">Código</th>
            <th className="text-left text-xs font-medium text-muted-foreground py-3">Campanha</th>
            <th className="text-center text-xs font-medium text-muted-foreground py-3">Desconto</th>
            <th className="text-center text-xs font-medium text-muted-foreground py-3 hidden md:table-cell">Usos</th>
            <th className="text-center text-xs font-medium text-muted-foreground py-3 hidden md:table-cell">Expira em</th>
            <th className="text-center text-xs font-medium text-muted-foreground py-3">Status</th>
            <th className="text-right text-xs font-medium text-muted-foreground py-3">Ativo</th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((coupon) => {
            const expired = isExpired(coupon.endDate);
            const isActive = coupon.isActive && !expired;

            return (
              <tr key={coupon.id} className="border-b border-border/20 last:border-0">
                <td className="py-3">
                  <span className="font-mono font-semibold text-primary text-sm">
                    {coupon.code}
                  </span>
                </td>
                <td className="py-3">
                  <p className="text-sm font-medium text-foreground">{coupon.campaignName}</p>
                  <p className="text-xs text-muted-foreground md:hidden">
                    {coupon.uses} usos • {formatDate(coupon.endDate)}
                  </p>
                </td>
                <td className="py-3 text-center">
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "font-mono",
                      isActive && "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)]"
                    )}
                  >
                    -{coupon.discount}%
                  </Badge>
                </td>
                <td className="py-3 text-center hidden md:table-cell">
                  <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {coupon.uses}
                  </div>
                </td>
                <td className="py-3 text-center hidden md:table-cell">
                  <span className="text-sm text-muted-foreground">
                    {formatDate(coupon.endDate)}
                  </span>
                </td>
                <td className="py-3 text-center">
                  {expired ? (
                    <Badge variant="secondary" className="text-[10px]">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Expirado
                    </Badge>
                  ) : isActive ? (
                    <Badge className="bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Pausado
                    </Badge>
                  )}
                </td>
                <td className="py-3 text-right">
                  <Switch
                    checked={coupon.isActive}
                    onCheckedChange={(checked) => onToggleCoupon(coupon.id, checked)}
                    disabled={expired}
                    className="data-[state=checked]:bg-[hsl(142,76%,36%)]"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
