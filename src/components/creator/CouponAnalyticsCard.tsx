import { useCouponAnalytics } from "@/hooks/useCreatorCoupons";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface Props { creatorId: string }

export default function CouponAnalyticsCard({ creatorId }: Props) {
  const { data, isLoading } = useCouponAnalytics(creatorId);
  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando análise…</p>;
  const total = (data as any)?.total_redemptions ?? 0;
  const totalDisc = Number((data as any)?.total_discounted ?? 0);
  const byDay = ((data as any)?.by_day ?? []) as { day: string; count: number; amount: number }[];
  return (
    <Card className="p-2 bg-muted/20 space-y-2">
      <div className="flex items-center gap-3 text-[11px]">
        <div>
          <p className="text-muted-foreground">Resgates</p>
          <p className="font-bold text-pink-300">{total}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Total economizado</p>
          <p className="font-bold text-pink-300">R$ {totalDisc.toFixed(2).replace(".", ",")}</p>
        </div>
      </div>
      {byDay.length > 0 && (
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDay}>
              <XAxis dataKey="day" hide />
              <YAxis hide />
              <Tooltip cursor={{ fill: "transparent" }} contentStyle={{ background: "#1a1a1a", border: "none", fontSize: 11 }} />
              <Bar dataKey="count" fill="#ec4899" radius={2} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
