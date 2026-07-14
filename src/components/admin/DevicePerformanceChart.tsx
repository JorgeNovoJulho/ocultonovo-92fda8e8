import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Smartphone, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

const TIER_COLORS = {
  high: "hsl(142, 71%, 45%)",
  medium: "hsl(45, 93%, 47%)",
  low: "hsl(0, 84%, 60%)",
  unknown: "hsl(215, 16%, 47%)",
};

const TIER_LABELS: Record<string, string> = {
  high: "Alto Desempenho",
  medium: "Médio",
  low: "Baixo Desempenho",
  unknown: "Não Detectado",
};

export function DevicePerformanceChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["device-tier-distribution"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("device_settings")
        .or("is_seed.eq.false,is_seed.is.null");

      if (error) throw error;

      const counts: Record<string, number> = { high: 0, medium: 0, low: 0, unknown: 0 };

      for (const p of profiles || []) {
        const settings = p.device_settings as any;
        const tier = settings?.performance?.tier;
        if (tier && counts[tier] !== undefined) {
          counts[tier]++;
        } else {
          counts.unknown++;
        }
      }

      return Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([key, value]) => ({
          name: TIER_LABELS[key] || key,
          value,
          color: TIER_COLORS[key as keyof typeof TIER_COLORS] || TIER_COLORS.unknown,
        }));
    },
    staleTime: 60000,
  });

  const total = data?.reduce((s, d) => s + d.value, 0) || 0;

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          Performance dos Dispositivos
        </CardTitle>
        <CardDescription>Distribuição por tier de hardware</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
            <Smartphone className="h-12 w-12 mb-2 opacity-30" />
            <p>Nenhum dado de dispositivo</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data?.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number) => [
                  `${value} (${((value / total) * 100).toFixed(1)}%)`,
                  "Usuários",
                ]}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
