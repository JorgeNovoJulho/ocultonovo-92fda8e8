import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search, SlidersHorizontal, Grid3x3, List, MapPin, Home, X, Circle, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRadarUsers, RadarMapUser } from "@/hooks/useRadarUsers";
import { useProfile } from "@/hooks/useProfile";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { cn } from "@/lib/utils";
import { getGenderLabel } from "@/lib/profileFormat";
import { toast } from "@/hooks/use-toast";
import { normalizePlanType } from "@/lib/planType";
import { normalizePublicStorageUrl } from "@/lib/storageUrl";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { useFollowRelationships, relationshipLabel } from "@/hooks/useFollowRelationships";


type ViewMode = "grid" | "list";
type LookingFor = "all" | "casal" | "homem" | "mulher" | "trans";
type AccessRange = "any" | "7" | "30" | "90";
type SortMode = "recommended" | "distance" | "newest" | "online";

// Tipos rápidos (chips superiores)
const QUICK_TYPES: { value: string; label: string }[] = [
  { value: "casal", label: "Casais" },
  { value: "casal-2m", label: "Casais (2 mulheres)" },
  { value: "casal-2h", label: "Casais (2 homens)" },
  { value: "homem", label: "Homens" },
  { value: "homem-trans", label: "Homens Trans" },
  { value: "mulher", label: "Mulheres" },
  { value: "mulher-trans", label: "Mulheres Trans" },
  { value: "travesti", label: "Travestis" },
  { value: "cd", label: "Cross-dressing (CD)" },
];

const DISTANCE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Qualquer distância" },
  { value: 5, label: "até 5km" },
  { value: 10, label: "até 10km" },
  { value: 25, label: "até 25km" },
  { value: 50, label: "até 50km" },
  { value: 100, label: "até 100km" },
  { value: 250, label: "até 250km" },
  { value: 500, label: "até 500km" },
];

function formatDistance(km?: number): string {
  if (km == null) return "";
  if (km < 2) return "A menos de 2 km";
  if (km < 10) return `${km.toFixed(1).replace(/\.0$/, "")} km`;
  return `${Math.round(km)} km`;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function bucketOf(u: RadarMapUser): string {
  const label = getGenderLabel((u as any).gender, u.profile_type);
  return label ? label.toLowerCase() : "";
}

function planLabel(plan?: string | null): { label: string; cls: string } | null {
  const p = normalizePlanType(plan);
  if (p === "vip") return { label: "VIP", cls: "border-[hsl(var(--gold))] bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))]" };
  if (p === "premium") return { label: "PREMIUM", cls: "border-secondary bg-secondary text-secondary-foreground" };
  if (p === "free") return { label: "GRATUITO", cls: "border-destructive bg-destructive text-destructive-foreground" };
  return { label: plan!.toString().toUpperCase(), cls: "border-border text-muted-foreground bg-muted/40" };
}

function gpsStatus(u: RadarMapUser): { ok: boolean; label: string } {
  if (u.gps_verified) return { ok: true, label: "GPS verificado" };
  return { ok: false, label: "Em verificação" };
}

function presenceLabel(u: RadarMapUser): { online: boolean; text: string } {
  if (u.is_online) return { online: true, text: "Online agora" };
  const ls = (u as any).last_seen as string | null | undefined;
  if (ls) {
    try {
      return { online: false, text: `Online ${formatDistanceToNow(new Date(ls), { addSuffix: true, locale: ptBR })}` };
    } catch {}
  }
  return { online: false, text: "Offline" };
}

// Wrapper local mantido por compatibilidade — delega para o helper canônico
// usado em todo o app. NÃO duplicar regras de placeholder aqui.
function resolveSearchAvatarUrl(avatarUrl?: string | null): string | null {
  return resolveAvatarUrl(avatarUrl);
}

const FILTERS_STORAGE_KEY = "pesquisar:filters:v1";
const PAGE_SIZE = 24;

export default function PesquisarPage() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const userLocation = useMemo(() => {
    const addressLat = (profile as any)?.address_lat;
    const addressLng = (profile as any)?.address_lng;
    const locationLat = profile?.location_lat;
    const locationLng = profile?.location_lng;
    const hasAddress = typeof addressLat === "number" && typeof addressLng === "number" && !(addressLat === 0 && addressLng === 0);
    const hasLocation = typeof locationLat === "number" && typeof locationLng === "number" && !(locationLat === 0 && locationLng === 0);
    if (!hasAddress && !hasLocation && !profile?.address_city) return undefined;
    return {
      lat: hasAddress ? addressLat : locationLat,
      lng: hasAddress ? addressLng : locationLng,
      city: profile?.address_city,
      state: profile?.address_state,
      verified: (profile as any)?.address_verified === true,
    };
  }, [profile?.location_lat, profile?.location_lng, profile?.address_city, profile?.address_state, (profile as any)?.address_lat, (profile as any)?.address_lng, (profile as any)?.address_verified]);

  const { data: users = [], isLoading } = useRadarUsers(userLocation, { includeAll: true });
  const { getRelationship } = useFollowRelationships();


  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem("pesquisar:view");
      return v === "list" ? "list" : "grid";
    } catch { return "grid"; }
  });
  useEffect(() => {
    try { localStorage.setItem("pesquisar:view", view); } catch {}
  }, [view]);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRecalc = useCallback(async (opts?: { silent?: boolean }) => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ["radar-users"] });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      if (!opts?.silent) {
        toast({
          title: "Distâncias atualizadas",
          description: "Recalculamos a distância dos usuários com base no seu endereço atual.",
        });
      }
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  }, [qc]);

  // Auto-recalcular quando o endereço/coordenadas do usuário mudarem (login ou edição)
  const lastCoordsRef = useRef<string>("");
  useEffect(() => {
    if (!userLocation) return;
    const sig = `${userLocation.lat?.toFixed(4)}|${userLocation.lng?.toFixed(4)}|${userLocation.city ?? ""}`;
    if (lastCoordsRef.current && lastCoordsRef.current !== sig) {
      handleRecalc({ silent: false });
    }
    lastCoordsRef.current = sig;
  }, [userLocation?.lat, userLocation?.lng, userLocation?.city, handleRecalc]);
  const [filterOpen, setFilterOpen] = useState(false);

  // Filtros (efeito imediato) — carregados de localStorage
  const persisted = useMemo(() => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(() => new Set(persisted?.selectedTypes ?? []));
  const [lookingFor, setLookingFor] = useState<LookingFor>(persisted?.lookingFor ?? "all");
  const [maxDistance, setMaxDistance] = useState<number>(persisted?.maxDistance ?? 0);
  const [ageMin, setAgeMin] = useState<string>(persisted?.ageMin ?? "");
  const [ageMax, setAgeMax] = useState<string>(persisted?.ageMax ?? "");
  const [cityFilter, setCityFilter] = useState<string>(persisted?.cityFilter ?? "");
  const [accessRange, setAccessRange] = useState<AccessRange>(persisted?.accessRange ?? "any");
  const [sortMode, setSortMode] = useState<SortMode>(persisted?.sortMode ?? "recommended");

  // Persistir filtros sempre que mudarem
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
        selectedTypes: Array.from(selectedTypes),
        lookingFor, maxDistance, ageMin, ageMax, cityFilter, accessRange, sortMode,
      }));
    } catch {}
  }, [selectedTypes, lookingFor, maxDistance, ageMin, ageMax, cityFilter, accessRange, sortMode]);

  // Seed aleatório fixo por sessão da página
  const [shuffleSeed] = useState<number>(() => Math.floor(Math.random() * 1e9));

  // Paginação: carregamento incremental
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const toggleType = (val: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedTypes(new Set());
    setLookingFor("all");
    setMaxDistance(0);
    setAgeMin("");
    setAgeMax("");
    setCityFilter("");
    setAccessRange("any");
    setSortMode("recommended");
  };

  const filtered = useMemo(() => {
    let list = profile?.id ? users.filter((u) => u.id !== profile.id) : users;

    // Busca por nome / username
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          (u.name ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q)
      );
    }

    // Filtro por cidade (texto livre, comparação contém)
    if (cityFilter.trim()) {
      const c = cityFilter.trim().toLowerCase();
      list = list.filter((u) => {
        const city = ((u as any).address_city ?? "").toString().toLowerCase();
        const state = ((u as any).address_state ?? "").toString().toLowerCase();
        return city.includes(c) || state.includes(c);
      });
    }

    // Tipos rápidos: mapeia para o gender bucket
    if (selectedTypes.size > 0) {
      list = list.filter((u) => {
        const b = bucketOf(u);
        for (const t of selectedTypes) {
          if (t === "casal" && b === "casal") return true;
          if (t === "casal-2m" && b === "casal") return true;
          if (t === "casal-2h" && b === "casal") return true;
          if (t === "homem" && b === "homem") return true;
          if (t === "mulher" && b === "mulher") return true;
          if ((t === "homem-trans" || t === "mulher-trans" || t === "travesti" || t === "cd") && b === "trans") return true;
        }
        return false;
      });
    }

    // Distância (só aplica se maxDistance > 0)
    if (maxDistance > 0) {
      list = list.filter((u) => {
        if (u.distanceKm == null) return false;
        return u.distanceKm <= maxDistance;
      });
    }

    // Idade
    const lo = parseInt(ageMin || "0", 10) || 0;
    const hi = parseInt(ageMax || "0", 10) || 0;
    if (lo > 0 || hi > 0) {
      const minA = lo > 0 ? lo : 18;
      const maxA = hi > 0 ? hi : 99;
      list = list.filter((u) => {
        if (u.age == null) return true;
        return u.age >= minA && u.age <= maxA;
      });
    }

    // Detecta se há algum filtro ativo (exceto busca por nome)
    const hasActiveFilter =
      selectedTypes.size > 0 ||
      lookingFor !== "all" ||
      maxDistance > 0 ||
      !!(ageMin || ageMax) ||
      !!cityFilter.trim() ||
      accessRange !== "any" ||
      sortMode !== "recommended";

    // Ordenação
    const hasAvatar = (u: typeof list[number]) => !!resolveSearchAvatarUrl(u.avatar_url);
    const sorted = [...list];
    if (!hasActiveFilter && !search.trim()) {
      // Sem filtros → ordem aleatória estável (rotativa por sessão)
      sorted.sort((a, b) => {
        const ha = hashStr(a.id + ":" + shuffleSeed);
        const hb = hashStr(b.id + ":" + shuffleSeed);
        return ha - hb;
      });
    } else {
      sorted.sort((a, b) => {
        switch (sortMode) {
          case "distance":
            return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
          case "online":
            return (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0);
          case "newest":
            return 0;
          case "recommended":
          default:
            return (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
        }
      });
    }
    // Prioriza cards com foto de perfil — sem foto vão para o final
    sorted.sort((a, b) => Number(hasAvatar(b)) - Number(hasAvatar(a)));
    return sorted;
  }, [users, profile?.id, search, selectedTypes, lookingFor, maxDistance, ageMin, ageMax, cityFilter, accessRange, sortMode, shuffleSeed]);

  const activeFilterCount =
    selectedTypes.size +
    (lookingFor !== "all" ? 1 : 0) +
    (maxDistance > 0 ? 1 : 0) +
    (ageMin || ageMax ? 1 : 0) +
    (cityFilter.trim() ? 1 : 0) +
    (accessRange !== "any" ? 1 : 0) +
    (sortMode !== "recommended" ? 1 : 0);

  // Reset paginação ao alterar filtros/busca
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, selectedTypes, lookingFor, maxDistance, ageMin, ageMax, cityFilter, accessRange, sortMode]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  // Sentinel para carregamento infinito
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
      }
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, filtered.length]);

  const cityState = (u: RadarMapUser) => {
    const c = (u as any).address_city as string | null | undefined;
    const s = (u as any).address_state as string | null | undefined;
    if (c && s) return `${c}/${s}`;
    if (c) return c;
    if (s) return s;
    return "";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-dvh bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/50">
        <div className="flex items-center gap-1 sm:gap-2 p-2 sm:p-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Pesquisar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 sm:pl-9 pr-8 sm:pr-9 h-8 sm:h-9 text-sm rounded-full bg-muted/40 border-border/50"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted"
                aria-label="Limpar"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
            onClick={() => handleRecalc()}
            aria-label="Recalcular distâncias"
            title="Recalcular distâncias"
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4 sm:h-5 sm:w-5", refreshing && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
            onClick={() => setView(view === "grid" ? "list" : "grid")}
            aria-label="Alternar visualização"
            title={view === "grid" ? "Ver em lista" : "Ver em grade"}
          >
            {view === "grid" ? <List className="h-4 w-4 sm:h-5 sm:w-5" /> : <Grid3x3 className="h-4 w-4 sm:h-5 sm:w-5" />}
          </Button>

          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 relative"
                aria-label="Filtros"
              >
                <SlidersHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[calc(100vw-1rem)] xs:w-[92vw] sm:w-full sm:max-w-md max-w-full overflow-y-auto overflow-x-hidden scrollbar-hide p-0 flex flex-col"
            >
              <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-3 sm:px-4 py-3 flex-row items-center justify-between gap-2 space-y-0">
                <SheetTitle className="text-sm sm:text-base truncate">Filtrar perfis</SheetTitle>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={clearFilters} className="h-8 px-2.5 text-xs sm:text-sm">
                    Limpar
                  </Button>
                  <Button size="sm" onClick={() => setFilterOpen(false)} className="h-8 px-2.5 text-xs sm:text-sm bg-primary text-primary-foreground">
                    Filtrar
                  </Button>
                </div>
              </SheetHeader>

              <div className="p-3 sm:p-4 space-y-5 sm:space-y-6 flex-1">

                {/* Buscar por */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Buscar por</h3>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TYPES.map((t) => {
                      const active = selectedTypes.has(t.value);
                      return (
                        <button
                          key={t.value}
                          onClick={() => toggleType(t.value)}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-xs border transition-colors",
                            active
                              ? "bg-foreground text-background border-foreground"
                              : "bg-background text-foreground border-border hover:border-primary/50"
                          )}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Que buscam por */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Que buscam por</h3>
                  <Select value={lookingFor} onValueChange={(v) => setLookingFor(v as LookingFor)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Qualquer</SelectItem>
                      <SelectItem value="casal">Casais</SelectItem>
                      <SelectItem value="homem">Homens</SelectItem>
                      <SelectItem value="mulher">Mulheres</SelectItem>
                      <SelectItem value="trans">Trans</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Cidade */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Cidade ou estado</h3>
                  <Input
                    type="text"
                    placeholder="Ex.: Sorocaba"
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                  />
                </div>

                {/* Distância */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Com distância de até</h3>
                  <Select
                    value={String(maxDistance)}
                    onValueChange={(v) => setMaxDistance(parseInt(v, 10))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISTANCE_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {profile?.location_lat != null && (
                    <div className="mt-1 text-[11px] text-muted-foreground text-right">
                      a partir do seu endereço de cadastro
                    </div>
                  )}
                </div>

                {/* Idade */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Com idade entre</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={18}
                      max={99}
                      placeholder="18"
                      value={ageMin}
                      onChange={(e) => setAgeMin(e.target.value)}
                      className="text-center flex-1 min-w-0 basis-20"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">e</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={18}
                      max={99}
                      placeholder="80"
                      value={ageMax}
                      onChange={(e) => setAgeMax(e.target.value)}
                      className="text-center flex-1 min-w-0 basis-20"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">anos</span>
                  </div>
                </div>


                {/* Acesso */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Com acesso feito</h3>
                  <Select value={accessRange} onValueChange={(v) => setAccessRange(v as AccessRange)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">A qualquer momento</SelectItem>
                      <SelectItem value="7">Nos últimos 7 dias</SelectItem>
                      <SelectItem value="30">Nos últimos 30 dias</SelectItem>
                      <SelectItem value="90">Nos últimos 90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Ordenar */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Ordenar por</h3>
                  <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">Recomendados</SelectItem>
                      <SelectItem value="distance">Mais próximos</SelectItem>
                      <SelectItem value="newest">Mais recentes</SelectItem>
                      <SelectItem value="online">Online agora</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Active filters */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide">
            <span className="text-[11px] text-muted-foreground shrink-0">{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
            <button
              onClick={clearFilters}
              className="text-[11px] text-primary underline shrink-0"
            >
              limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide overscroll-contain">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Carregando perfis...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum perfil encontrado.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Ajuste os filtros e tente novamente.</p>
          </div>
        ) : view === "grid" ? (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3 p-2 sm:p-3">
            {visible.map((u) => {
              const pres = presenceLabel(u);
              const avatarUrl = resolveSearchAvatarUrl(u.avatar_url);
              const rel = getRelationship(u.id);
              const relTag = relationshipLabel(rel);
              return (
              <button
                key={u.id}
                type="button"
                onClick={() => navigate(`/u/${u.username ?? u.id}`)}
                className="text-left group touch-manipulation cursor-pointer active:opacity-80"
                style={{ WebkitTapHighlightColor: "transparent" }}
                aria-label={`Abrir perfil de ${u.username ? "@" + u.username : u.name || "usuário"}`}
              >
                <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={u.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-1 text-center pointer-events-none">
                      <span className="text-3xl font-semibold leading-none">
                        {(u.name ?? "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="mt-1 text-[9px] leading-tight text-amber-500/90 font-medium">
                        Atualize a foto do seu perfil para mais visualizações
                      </span>
                    </div>
                  )}
                  {u.is_verified && (
                    <span className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center text-[10px] text-white pointer-events-none">
                      ✓
                    </span>
                  )}
                  <span
                    className={cn(
                      "absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold backdrop-blur pointer-events-none",
                      pres.online
                        ? "bg-green-500 text-white"
                        : "bg-red-500 text-white"
                    )}
                  >
                    <Circle className="h-1.5 w-1.5 fill-white text-white" />
                    {pres.online ? "Online" : "Offline"}
                  </span>
                  {relTag && (
                    <span
                      className={cn(
                        "absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border backdrop-blur pointer-events-none",
                        relTag.cls,
                      )}
                    >
                      {relTag.label}
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{u.name || "Em verificação"}</span>
                    {planLabel(u.plan_type) && (
                      <span className={cn("shrink-0 text-[9px] px-1.5 py-[1px] rounded-full border font-semibold uppercase", planLabel(u.plan_type)!.cls)}>
                        {planLabel(u.plan_type)!.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">@{u.username ?? u.id.slice(0, 6)}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>♂♀</span>
                    <span className="truncate">{getGenderLabel((u as any).gender, u.profile_type) || "Em verificação"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Home className="h-3 w-3 shrink-0" />
                    <span className="truncate">{cityState(u) || "Em verificação"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span>{u.distanceKm != null ? formatDistance(u.distanceKm) : "Em verificação"}</span>
                  </div>
                  {(() => { const g = gpsStatus(u); return (
                    <div className={cn(
                      "inline-flex items-center gap-1 text-[10px] px-1.5 py-[1px] rounded-full border w-fit",
                      g.ok ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10" : "border-amber-500/40 text-amber-500 bg-amber-500/10"
                    )}>
                      {g.ok ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                      <span className="truncate">{g.label}</span>
                    </div>
                  );})()}
                    <div className={cn("text-[10px] truncate font-medium", pres.online ? "text-green-500" : "text-red-500")}>
                    {pres.text}
                  </div>
                  {relTag && (
                    <div className={cn(
                      "inline-flex items-center gap-1 text-[10px] px-1.5 py-[1px] rounded-full border font-semibold w-fit mt-1",
                      relTag.cls,
                    )}>
                      {relTag.label}
                    </div>
                  )}
                </div>
              </button>
            );})}

          </div>
          {hasMore && <div ref={sentinelRef} className="h-12 flex items-center justify-center text-xs text-muted-foreground">Carregando mais...</div>}
          </>
        ) : (
          <>
          <div className="divide-y divide-border">
            {visible.map((u) => {
              const pres = presenceLabel(u);
              const avatarUrl = resolveSearchAvatarUrl(u.avatar_url);
              const rel = getRelationship(u.id);
              const relTag = relationshipLabel(rel);
              return (
              <button
                key={u.id}
                type="button"
                onClick={() => navigate(`/u/${u.username ?? u.id}`)}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 text-left touch-manipulation cursor-pointer active:bg-muted/60"
                style={{ WebkitTapHighlightColor: "transparent" }}
                aria-label={`Abrir perfil de ${u.username ? "@" + u.username : u.name || "usuário"}`}
              >
                <div className="relative h-14 w-14 rounded-full overflow-hidden bg-muted shrink-0 pointer-events-none">
                  {avatarUrl ? (
                    <img decoding="async" src={buildSupabaseImageThumb(avatarUrl, { width: 112, quality: 72 }) ?? avatarUrl} alt={u.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-semibold text-muted-foreground">
                      {(u.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-background",
                      pres.online ? "bg-emerald-500" : "bg-muted-foreground/40"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold truncate">{u.name || "Em verificação"}</span>
                    {u.is_verified && <Badge variant="outline" className="h-4 px-1 text-[9px] border-emerald-500/40 text-emerald-500">✓</Badge>}
                    {planLabel(u.plan_type) && (
                      <span className={cn("shrink-0 text-[9px] px-1.5 py-[1px] rounded-full border font-semibold uppercase", planLabel(u.plan_type)!.cls)}>
                        {planLabel(u.plan_type)!.label}
                      </span>
                    )}
                    <span className={cn("shrink-0 text-[9px] px-1.5 py-[1px] rounded-full border font-semibold", pres.online ? "border-green-500 text-white bg-green-500" : "border-red-500 text-white bg-red-500")}>
                      {pres.online ? "ONLINE" : "OFFLINE"}
                    </span>
                    {relTag && (
                      <span className={cn("shrink-0 text-[9px] px-1.5 py-[1px] rounded-full border font-semibold", relTag.cls)}>
                        {relTag.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">@{u.username ?? u.id.slice(0, 6)}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <span className="truncate">{getGenderLabel((u as any).gender, u.profile_type) || "Em verificação"}</span>
                    <span className="truncate">• {cityState(u) || "Em verificação"}</span>
                    <span className="shrink-0">• {u.distanceKm != null ? formatDistance(u.distanceKm) : "Em verificação"}</span>
                    {(() => { const g = gpsStatus(u); return (
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[10px] px-1.5 py-[1px] rounded-full border",
                        g.ok ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10" : "border-amber-500/40 text-amber-500 bg-amber-500/10"
                      )}>
                        {g.ok ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                        {g.label}
                      </span>
                    );})()}
                  </div>
                  <div className={cn("text-[10px] mt-0.5 truncate font-medium", pres.online ? "text-green-500" : "text-red-500")}>
                    {pres.text}
                  </div>
                  {!avatarUrl && (
                    <div className="mt-0.5 text-[10px] text-amber-500/90 font-medium">
                      Atualize a foto do seu perfil para mais visualizações
                    </div>
                  )}
                </div>
              </button>
            );})}

          </div>
          {hasMore && <div ref={sentinelRef} className="h-12 flex items-center justify-center text-xs text-muted-foreground">Carregando mais...</div>}
          </>
        )}
      </div>
    </div>
  );
}
