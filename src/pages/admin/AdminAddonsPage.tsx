import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Ghost, Save, Loader2, Package, Users, Eye } from "lucide-react";
import { useAllAddonConfigs, useUpdateAddonConfig } from "@/hooks/useAddonConfig";
import { supabase } from "@/lib/supabaseExternal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function useGhostModeStats() {
  return useQuery({
    queryKey: ["admin-ghost-stats"],
    staleTime: 30_000,
    queryFn: async () => {
      const [activeRes, totalRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_ghost_active", true),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("has_ghost_mode", true),
      ]);
      return {
        activeNow: activeRes.count || 0,
        totalOwners: totalRes.count || 0,
      };
    },
  });
}

export default function AdminAddonsPage() {
  const { data: addons, isLoading } = useAllAddonConfigs();
  const updateAddon = useUpdateAddonConfig();
  const { data: ghostStats } = useGhostModeStats();

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-2xl">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Configurações de Add-ons
        </h1>
        {[1, 2].map((i) => (
          <Card key={i} className="bg-card/50 border-border/30">
            <CardContent className="pt-6 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        Configurações de Add-ons
      </h1>

      {/* Ghost Mode Stats */}
      {ghostStats && (
        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Estatísticas do Modo Fantasma
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-primary">{ghostStats.activeNow}</p>
                <p className="text-xs text-muted-foreground">Ativos agora</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-foreground">{ghostStats.totalOwners}</p>
                <p className="text-xs text-muted-foreground">Total com add-on</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(!addons || addons.length === 0) ? (
        <Card className="bg-card/50 border-border/30">
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum add-on configurado
          </CardContent>
        </Card>
      ) : (
        addons.map((addon) => (
          <AddonConfigCard key={addon.id} addon={addon} onUpdate={updateAddon.mutate} isPending={updateAddon.isPending} />
        ))
      )}
    </div>
  );
}

function AddonConfigCard({
  addon,
  onUpdate,
  isPending,
}: {
  addon: { id: string; slug: string; name: string; description: string | null; price_monthly: number; is_enabled: boolean; min_plan: string; icon: string };
  onUpdate: (args: { id: string; updates: any }) => void;
  isPending: boolean;
}) {
  const [price, setPrice] = useState(String(addon.price_monthly));
  const [minPlan, setMinPlan] = useState(addon.min_plan);
  const [isEnabled, setIsEnabled] = useState(addon.is_enabled);
  const [dirty, setDirty] = useState(false);

  const handleSave = () => {
    const numPrice = parseFloat(price.replace(",", "."));
    if (isNaN(numPrice) || numPrice < 0) return;
    onUpdate({
      id: addon.id,
      updates: { price_monthly: numPrice, min_plan: minPlan, is_enabled: isEnabled },
    });
    setDirty(false);
  };

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Ghost className="h-5 w-5 text-primary" />
            {addon.name}
          </span>
          <Badge variant={isEnabled ? "default" : "secondary"} className="text-xs">
            {isEnabled ? "Ativo" : "Desativado"}
          </Badge>
        </CardTitle>
        {addon.description && (
          <p className="text-xs text-muted-foreground">{addon.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor={`toggle-${addon.id}`} className="text-sm">Habilitado para usuários</Label>
          <Switch
            id={`toggle-${addon.id}`}
            checked={isEnabled}
            onCheckedChange={(c) => { setIsEnabled(c); setDirty(true); }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`price-${addon.id}`} className="text-sm">Preço (R$)</Label>
          <Input
            id={`price-${addon.id}`}
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => { setPrice(e.target.value); setDirty(true); }}
            className="bg-muted/30 border-border/50"
            placeholder="9.90"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Plano mínimo para compra</Label>
          <Select value={minPlan} onValueChange={(v) => { setMinPlan(v); setDirty(true); }}>
            <SelectTrigger className="bg-muted/30 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Gratuito</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dirty && (
          <Button onClick={handleSave} disabled={isPending} className="w-full bg-primary text-primary-foreground">
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Alterações
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
