/**
 * Heatmap Geográfico de Usuários Ativos
 * Visualiza distribuição de usuários por região com mapa Leaflet
 */
import { useState } from "react";
import { MapPin, RefreshCw, Users, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

interface RegionData {
  region: string;
  city: string;
  count: number;
  percentage: number;
  lat?: number;
  lng?: number;
}

interface GeoHeatmapResult {
  ranking: RegionData[];
  totalLocated: number;
  totalCities: number;
}

export function GeoHeatmapCard() {
  const [viewMode, setViewMode] = useState<'regions' | 'cities'>('cities');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['geo-heatmap', viewMode],
    queryFn: async (): Promise<GeoHeatmapResult> => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('address_city, address_state, location_lat, location_lng')
        .not('address_city', 'is', null)
        .or('is_seed.eq.false,is_seed.is.null');

      if (error) return { ranking: [], totalLocated: 0, totalCities: 0 };

      const aggregated = new Map<string, { count: number; lat: number; lng: number }>();

      (profiles || []).forEach((p: any) => {
        const key = viewMode === 'regions'
          ? (p.address_state || 'Desconhecido')
          : `${p.address_city || '?'}, ${p.address_state || ''}`.trim();

        const existing = aggregated.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          aggregated.set(key, {
            count: 1,
            lat: Number(p.location_lat) || -23.5,
            lng: Number(p.location_lng) || -46.6,
          });
        }
      });

      const totalLocated = profiles?.length || 0;
      const totalCities = aggregated.size;

      const ranking = Array.from(aggregated.entries())
        .map(([location, data]) => ({
          region: viewMode === 'regions' ? location : location.split(',')[1]?.trim() || '',
          city: viewMode === 'cities' ? location.split(',')[0]?.trim() || location : '',
          count: data.count,
          percentage: totalLocated > 0 ? Math.round((data.count / totalLocated) * 100) : 0,
          lat: data.lat,
          lng: data.lng,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      return { ranking, totalLocated, totalCities };
    },
    refetchInterval: 60000,
  });

  const geoData = data?.ranking || [];
  const totalLocated = data?.totalLocated || 0;
  const totalCities = data?.totalCities || 0;
  const maxCount = geoData[0]?.count || 1;




  const getColor = (count: number) => {
    const ratio = count / maxCount;
    if (ratio >= 0.7) return '#ef4444';
    if (ratio >= 0.4) return '#f97316';
    return '#ec4899';
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Usuários Ativos por Região
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground/60 hover:text-foreground transition-colors"
                      aria-label="Sobre este card"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[300px] text-xs">
                    <strong>Localizados</strong> = TOTAL de usuários reais com cidade/estado preenchidos.
                    O ranking abaixo mostra apenas o <strong>top 15</strong> para legibilidade.
                    Diferença em relação a <em>Usuários Ativos</em> (total de perfis) significa que parte dos usuários ainda não informou localização.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>Distribuição geográfica em tempo real · ranking limitado ao top 15</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === 'regions' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('regions')}>Estados</Button>
            <Button variant={viewMode === 'cities' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('cities')}>Cidades</Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : (
          <>
            {/* Banner geográfico (mapa removido para evitar conflitos do Leaflet) */}
            <div
              className="rounded-xl border border-border/40 flex items-center justify-center text-xs text-muted-foreground"
              style={{ height: 80, background: 'hsl(var(--muted) / 0.4)' }}
            >
              <MapPin className="h-4 w-4 mr-2 text-primary" />
              {totalLocated} usuários localizados em {totalCities} {viewMode === 'cities' ? 'cidades' : 'estados'}
              {geoData.length < totalCities && (
                <span className="ml-2 opacity-70">· top {geoData.length} exibidas</span>
              )}
            </div>

            {/* Ranking */}
            <div className="space-y-2">
              {(geoData || []).map((item, index) => (
                <div key={`${item.region}-${item.city}-${index}`} className="flex items-center gap-3 px-1">
                  <span className="text-sm font-bold text-muted-foreground w-6">#{index + 1}</span>
                  <span className="flex-1 text-sm font-medium truncate">
                    {viewMode === 'cities' ? `${item.city}, ${item.region}` : item.region}
                  </span>
                  <div className="w-24 bg-muted rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(8, item.percentage * 3)}%`,
                        background: getColor(item.count),
                      }}
                    />
                  </div>
                  <span className="text-sm font-bold w-8 text-right">{item.count}</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total com localização</span>
              </div>
              <Badge variant="secondary">{totalLocated}</Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
