import { useState, useMemo, useEffect, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { motion, AnimatePresence } from "framer-motion";
import { AbstractRadar } from "@/components/radar/AbstractRadar";
import { UserListSidebar } from "@/components/radar/UserListSidebar";
import { MobileUsersSheet } from "@/components/radar/MobileUsersSheet";
import { useRadarUsers, useRadarRealtime, RadarMapUser } from "@/hooks/useRadarUsers";
import { useSocialBoosts } from "@/hooks/useSocialBoosts";
import { useLookingNow } from "@/hooks/useLookingNow";
import { useLookingNowNearby } from "@/hooks/useLookingNowNearby";
import { useProfile } from "@/hooks/useProfile";
import { useRadarPings } from "@/hooks/useRadarPings";
import { LookingNowToggle } from "@/components/LookingNowToggle";
import { LookingNowProximityIndicator } from "@/components/radar/LookingNowProximityIndicator";
import { RadarPingsHistory } from "@/components/radar/RadarPingsHistory";
import { LuckyMatchButton } from "@/components/LuckyMatchButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radar, Sparkles, Filter, Locate, RefreshCw, PanelLeftClose, PanelLeft, Flame, Crown, RotateCcw, ArrowUpDown, Wifi, WifiOff, MapPin, Plane, Home, AlertCircle, History, Play, Pause } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Gender } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFreePlanRestrictions, useIncrementUsage } from "@/hooks/useFreePlanLimits";
import { UpsellModal } from "@/components/UpsellModal";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getGenderLabel } from "@/lib/profileFormat";
import { toast } from "@/hooks/use-toast";
import "@/components/radar/abstract-radar.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type SortMode = "priority" | "distance" | "age" | "online";
type LocationSource = "gps" | "profile" | "none";
type LocationHistoryEntry = {
  ts: number;
  lat: number;
  lng: number;
  source: LocationSource;
  city?: string | null;
  distanceFromHomeKm?: number | null;
};

const PREFS_KEY = "radar:prefs:v1";
const HISTORY_KEY = "radar:locHistory:v1";
const HISTORY_MAX = 5;

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : null;
  } catch { return null; }
}
function savePrefs(p: Record<string, unknown>) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
function loadHistory(): LocationHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j.slice(0, HISTORY_MAX) : [];
  } catch { return []; }
}
function saveHistory(h: LocationHistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, HISTORY_MAX))); } catch { /* ignore */ }
}

const DEFAULTS = {
  activeFilter: "all" as Gender | "all",
  showLookingNowOnly: false,
  maxRadiusKm: 50,
  ageRange: [18, 80] as [number, number],
  sortMode: "priority" as SortMode,
  gpsOnlyInRadius: false,
  quickVipOnly: false,
  quickOnlineOnly: false,
  quickNear5Only: false,
};


// Buckets explícitos do mock
const BUCKET_OPTIONS: { value: Gender | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "homem", label: "HOMEM" },
  { value: "mulher", label: "MULHER" },
  { value: "casal", label: "CASAL" },
  { value: "trans", label: "TRANS" },
];

const filterOptions = BUCKET_OPTIONS;

export default function RadarPage() {
  const isMobile = useIsMobile();
  // Hidrata prefs do localStorage
  const initialPrefs = useMemo(() => loadPrefs(), []);
  const [activeFilter, setActiveFilter] = useState<Gender | "all">(
    (initialPrefs?.activeFilter as Gender | "all") ?? DEFAULTS.activeFilter
  );
  const [showLookingNowOnly, setShowLookingNowOnly] = useState<boolean>(
    typeof initialPrefs?.showLookingNowOnly === "boolean" ? initialPrefs.showLookingNowOnly : DEFAULTS.showLookingNowOnly
  );
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [locationSource, setLocationSource] = useState<LocationSource>(
    (initialPrefs?.locationSource as LocationSource) ?? "none"
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gpsCity, setGpsCity] = useState<string | null>(initialPrefs?.gpsCity ?? null);
  const [locHistory, setLocHistory] = useState<LocationHistoryEntry[]>(() => loadHistory());
  const [selectedUser, setSelectedUser] = useState<RadarMapUser | null>(null);
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  const [isLocating, setIsLocating] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [maxRadiusKm, setMaxRadiusKm] = useState<number>(
    typeof initialPrefs?.maxRadiusKm === "number" ? initialPrefs.maxRadiusKm : DEFAULTS.maxRadiusKm
  );
  const [ageRange, setAgeRange] = useState<[number, number]>(
    Array.isArray(initialPrefs?.ageRange) && initialPrefs.ageRange.length === 2
      ? (initialPrefs.ageRange as [number, number])
      : DEFAULTS.ageRange
  );
  const [showEmptyState, setShowEmptyState] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>(
    (initialPrefs?.sortMode as SortMode) ?? DEFAULTS.sortMode
  );
  const [gpsOnlyInRadius, setGpsOnlyInRadius] = useState<boolean>(
    typeof initialPrefs?.gpsOnlyInRadius === "boolean" ? initialPrefs.gpsOnlyInRadius : DEFAULTS.gpsOnlyInRadius
  );
  // Quick-filter chips
  const [quickVipOnly, setQuickVipOnly] = useState<boolean>(
    typeof initialPrefs?.quickVipOnly === "boolean" ? initialPrefs.quickVipOnly : DEFAULTS.quickVipOnly
  );
  const [quickOnlineOnly, setQuickOnlineOnly] = useState<boolean>(
    typeof initialPrefs?.quickOnlineOnly === "boolean" ? initialPrefs.quickOnlineOnly : DEFAULTS.quickOnlineOnly
  );
  const [quickNear5Only, setQuickNear5Only] = useState<boolean>(
    typeof initialPrefs?.quickNear5Only === "boolean" ? initialPrefs.quickNear5Only : DEFAULTS.quickNear5Only
  );
  // Quando foi a última vez que recalculei a distância usando GPS
  const [lastGpsAt, setLastGpsAt] = useState<number | null>(null);
  // Auto-refresh do radar (GPS + perfis) a cada 60s
  const [autoRefresh, setAutoRefresh] = useState<boolean>(
    typeof initialPrefs?.autoRefresh === "boolean" ? initialPrefs.autoRefresh : true
  );
  // Tick a cada 15s para atualizar "há Xs" do realtime
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  // Persiste prefs sempre que mudam
  useEffect(() => {
    savePrefs({
      activeFilter,
      showLookingNowOnly,
      maxRadiusKm,
      ageRange,
      sortMode,
      locationSource,
      gpsCity,
      gpsOnlyInRadius,
      autoRefresh,
      quickVipOnly,
      quickOnlineOnly,
      quickNear5Only,
    });
  }, [activeFilter, showLookingNowOnly, maxRadiusKm, ageRange, sortMode, locationSource, gpsCity, gpsOnlyInRadius, autoRefresh, quickVipOnly, quickOnlineOnly, quickNear5Only]);

  const { profile } = useProfile();
  const registeredOrigin = useMemo(() => {
    const lat = (profile as any)?.address_lat ?? profile?.location_lat;
    const lng = (profile as any)?.address_lng ?? profile?.location_lng;
    if (lat == null || lng == null) return undefined;
    return {
      lat: Number(lat),
      lng: Number(lng),
      city: (profile as any)?.address_city ?? null,
      state: (profile as any)?.address_state ?? null,
      verified: (profile as any)?.address_verified ?? null,
    };
  }, [profile]);
  const { data: users = [], isLoading, refetch, isRefetching } = useRadarUsers(userLocation, { displayOrigin: registeredOrigin });
  const { isLookingNow } = useLookingNow();
  const { canSearchRadar, remainingRadarSearches, limits, isFreePlan } = useFreePlanRestrictions();
  const incrementUsage = useIncrementUsage();
  const { pingersSet, pingedByMeSet, sendPing, pingAnimation, isPingSending } = useRadarPings();
  const { count: nearbyLookingNowCount } = useLookingNowNearby(users, userLocation);
  // Realtime: atualiza lista do radar sem reload + status de conexão
  const { status: rtStatus, lastUpdateAt } = useRadarRealtime();

  // Normaliza gênero combinando gender + profile_type, sempre retornando bucket lowercase canônico
  const normalizeBucket = (g?: string | null, profileType?: string | null): "homem" | "mulher" | "casal" | "trans" | null => {
    const label = getGenderLabel(g, profileType); // CASAL/HOMEM/MULHER/TRANS
    return label ? (label.toLowerCase() as any) : null;
  };

  // Debounce mínimo (60ms) só p/ não thrashar a cada tick do drag.
  // Atualiza praticamente em tempo real ao soltar o slider/tag.
  const debouncedMaxRadiusKm = useDebounce(maxRadiusKm, 60);
  const debouncedAgeRange = useDebounce(ageRange, 60);

  // Aura Social — boost_radar (multiplicador no priorityScore)
  const userIdsForBoost = useMemo(
    () => users.map((u) => u.id).filter(Boolean) as string[],
    [users]
  );
  const radarBoosts = useSocialBoosts(userIdsForBoost, 'boost_radar');

  const filteredUsers = useMemo(() => {
    // Sempre exclui o usuário logado — ele aparece fixo no centro do radar
    let filtered = profile?.id ? users.filter((u) => u.id !== profile.id) : users;
    if (showLookingNowOnly) {
      filtered = filtered.filter((u) => u.is_looking_now);
    }
    if (activeFilter !== "all") {
      filtered = filtered.filter((u) => normalizeBucket((u as any).gender, u.profile_type) === activeFilter);
    }
    // Quick filters (sincronizam radar + sidebar)
    if (quickVipOnly) {
      filtered = filtered.filter((u) => u.plan_type === "vip");
    }
    if (quickOnlineOnly) {
      filtered = filtered.filter((u) => u.is_online);
    }
    if (quickNear5Only) {
      filtered = filtered.filter((u) => u.distanceKm != null && u.distanceKm <= 5);
    }
    // Filtra pelo raio escolhido. Sem distância conhecida (sem GPS) = mantém quando slider no máximo.
    filtered = filtered.filter((u) => {
      if (u.distanceKm == null) {
        // Quando "apenas GPS no raio" estiver ativo e tivermos GPS, exige distância conhecida.
        if (gpsOnlyInRadius && locationSource === "gps") return false;
        return debouncedMaxRadiusKm >= 500;
      }
      return u.distanceKm <= debouncedMaxRadiusKm;
    });
    // Filtra por idade. Sem idade conhecida (hide_age ou birth_date ausente) = mantém sempre,
    // para não esconder usuários por falta de dado ou por opção de privacidade.
    filtered = filtered.filter((u) => {
      if (u.age == null) return true;
      return u.age >= debouncedAgeRange[0] && u.age <= debouncedAgeRange[1];
    });

    // Ordenação personalizável
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortMode) {
        case "distance":
          return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
        case "age":
          return (a.age ?? Infinity) - (b.age ?? Infinity);
        case "online": {
          const ao = (a.is_online ? 1 : 0) + (a.is_looking_now ? 1 : 0);
          const bo = (b.is_online ? 1 : 0) + (b.is_looking_now ? 1 : 0);
          if (bo !== ao) return bo - ao;
          const aBoost = radarBoosts.get(a.id) ?? 1;
          const bBoost = radarBoosts.get(b.id) ?? 1;
          return ((b.priorityScore ?? 0) * bBoost) - ((a.priorityScore ?? 0) * aBoost);
        }
        case "priority":
        default: {
          const aBoost = radarBoosts.get(a.id) ?? 1;
          const bBoost = radarBoosts.get(b.id) ?? 1;
          const diff = ((b.priorityScore ?? 0) * bBoost) - ((a.priorityScore ?? 0) * aBoost);
          if (diff !== 0) return diff;
          return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
        }
      }
    });
    return sorted;
  }, [users, activeFilter, showLookingNowOnly, debouncedMaxRadiusKm, debouncedAgeRange, sortMode, gpsOnlyInRadius, locationSource, profile?.id, quickVipOnly, quickOnlineOnly, quickNear5Only, radarBoosts]);

  const resetFilters = () => {
    setActiveFilter(DEFAULTS.activeFilter);
    setShowLookingNowOnly(DEFAULTS.showLookingNowOnly);
    setMaxRadiusKm(DEFAULTS.maxRadiusKm);
    setAgeRange(DEFAULTS.ageRange);
    setSortMode(DEFAULTS.sortMode);
    setGpsOnlyInRadius(DEFAULTS.gpsOnlyInRadius);
    setQuickVipOnly(DEFAULTS.quickVipOnly);
    setQuickOnlineOnly(DEFAULTS.quickOnlineOnly);
    setQuickNear5Only(DEFAULTS.quickNear5Only);
  };

  // Tempo desde o último update do realtime
  const secondsSinceUpdate = lastUpdateAt ? Math.max(0, Math.floor((Date.now() - lastUpdateAt) / 1000)) : null;
  const formatAgo = (s: number | null) => {
    if (s == null) return "aguardando";
    if (s < 60) return `há ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `há ${m}min`;
    const h = Math.floor(m / 60);
    return `há ${h}h`;
  };

  const onlineCount = users.filter((u) => u.is_online).length;
  const lookingNowCount = users.filter((u) => u.is_looking_now).length;

  // Reverse-geocoding leve via Nominatim (cidade da posição GPS atual)
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1&accept-language=pt-BR`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return;
      const j = await res.json();
      const a = j?.address ?? {};
      const city = a.city || a.town || a.village || a.municipality || a.county || null;
      if (city) setGpsCity(String(city));
    } catch { /* silencioso */ }
  };

  // Haversine
  const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const R = 6371;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  // Anti-spam: só registra nova entrada de histórico se a distância em relação à anterior > 0.3km
  // ou se a fonte mudou.
  const lastRecordedRef = useRef<{ lat: number; lng: number; source: LocationSource } | null>(null);
  const recordHistory = (lat: number, lng: number, source: LocationSource, city?: string | null) => {
    const last = lastRecordedRef.current;
    if (last && last.source === source) {
      const moved = haversineKm(last.lat, last.lng, lat, lng);
      if (moved < 0.3) return;
    }
    lastRecordedRef.current = { lat, lng, source };
    const distFromHome =
      profile?.location_lat != null && profile?.location_lng != null
        ? haversineKm(profile.location_lat, profile.location_lng, lat, lng)
        : null;
    setLocHistory((prev) => {
      const next: LocationHistoryEntry[] = [
        { ts: Date.now(), lat, lng, source, city: city ?? null, distanceFromHomeKm: distFromHome },
        ...prev,
      ].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });
  };

  // Aplica posição GPS com prioridade sobre o endereço de cadastro.
  // Ignora micro-mudanças (<50m) para não recriar a query e fazer o radar piscar.
  const applyGpsPosition = (pos: GeolocationPosition) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    setUserLocation((prev) => {
      if (prev) {
        const R = 6371000; // metros
        const dLat = ((lat - prev.lat) * Math.PI) / 180;
        const dLng = ((lng - prev.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((prev.lat * Math.PI) / 180) *
            Math.cos((lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (distM < 50) return prev; // mantém referência → sem refetch
      }
      return { lat, lng };
    });
    setLocationSource("gps");
    setLocationError(null);
    setLastGpsAt(Date.now());
    reverseGeocode(lat, lng);
    recordHistory(lat, lng, "gps", gpsCity);
  };

  const requestLocation = (highAccuracy = true, options?: { silent?: boolean }) => {
    if (isFreePlan && !canSearchRadar) { setShowUpsell(true); return; }
    setIsLocating(true);
    setLocationError(null);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyGpsPosition(pos);
          setIsLocating(false);
          if (isFreePlan) incrementUsage.mutate("radar_searches");
          if (!options?.silent) {
            toast({
              title: "Localização atualizada",
              description: "Usando sua posição GPS atual.",
            });
          }
        },
        (err) => {
          // Só faz fallback para o endereço de cadastro quando ainda não temos GPS
          if (locationSource !== "gps" && profile?.location_lat != null && profile?.location_lng != null) {
            setUserLocation({ lat: profile.location_lat, lng: profile.location_lng });
            setLocationSource("profile");
            recordHistory(profile.location_lat, profile.location_lng, "profile", null);
          }
          let msg = "Falha ao obter GPS";
          if (err?.code === 1) msg = "Permissão de localização negada";
          else if (err?.code === 2) msg = "Localização indisponível";
          else if (err?.code === 3) msg = "Tempo esgotado ao obter GPS";
          setLocationError(msg);
          setIsLocating(false);
          if (!options?.silent) {
            toast({
              title: "Não foi possível obter o GPS",
              description: err?.code === 1
                ? "Habilite a permissão de localização nas configurações do navegador."
                : msg,
              variant: "destructive",
            });
          }
        },
        { timeout: 10000, maximumAge: 30000, enableHighAccuracy: highAccuracy }
      );
    } else {
      if (profile?.location_lat != null && profile?.location_lng != null) {
        setUserLocation({ lat: profile.location_lat, lng: profile.location_lng });
        setLocationSource("profile");
        recordHistory(profile.location_lat, profile.location_lng, "profile", null);
      }
      setLocationError("Geolocalização não suportada neste dispositivo");
      setIsLocating(false);
      if (!options?.silent) {
        toast({
          title: "GPS indisponível",
          description: "Geolocalização não é suportada neste dispositivo.",
          variant: "destructive",
        });
      }
    }
  };

  const handleRefresh = () => {
    if (isFreePlan && !canSearchRadar) { setShowUpsell(true); return; }
    refetch();
    if (isFreePlan) incrementUsage.mutate("radar_searches");
  };

  // Bootstrap: usa endereço de cadastro só enquanto o GPS não chega
  useEffect(() => {
    if (locationSource !== "gps" && !userLocation && profile?.location_lat != null && profile?.location_lng != null) {
      setUserLocation({ lat: profile.location_lat, lng: profile.location_lng });
      setLocationSource("profile");
    }
    requestLocation(true, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.location_lat, profile?.location_lng]);

  // Watch GPS — atualiza apenas com baixa frequência (mobile economiza bateria
  // e evita refazer query do radar a cada micro-mudança de coordenada).
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => applyGpsPosition(pos),
      () => { /* mantém última posição válida */ },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh: o próprio useRadarUsers já tem refetchInterval de 60s + realtime.
  // Aqui só reforçamos uma atualização silenciosa de GPS a cada 2 min quando
  // a aba estiver visível, sem disparar refetch extra (evita flicker mobile).
  useEffect(() => {
    if (!autoRefresh) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      requestLocation(false, { silent: true });
    };
    const id = setInterval(tick, 120000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  // Distância entre o endereço de cadastro e a posição GPS atual (Haversine)
  const travelDistanceKm = useMemo(() => {
    if (locationSource !== "gps" || !userLocation) return null;
    if (profile?.location_lat == null || profile?.location_lng == null) return null;
    const R = 6371;
    const dLat = ((userLocation.lat - profile.location_lat) * Math.PI) / 180;
    const dLng = ((userLocation.lng - profile.location_lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((profile.location_lat * Math.PI) / 180) *
        Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, [locationSource, userLocation, profile?.location_lat, profile?.location_lng]);

  // Re-show the empty-state card whenever the user changes filters
  useEffect(() => {
    setShowEmptyState(true);
  }, [activeFilter, showLookingNowOnly, maxRadiusKm, ageRange]);

  return (
    <div
      className="flex flex-col md:flex-row h-[calc(100dvh-4rem)] md:h-dvh relative md:overflow-hidden bg-background"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Desktop Sidebar */}
      {!isMobile && showSidebar && (
        <motion.div
          initial={{ x: -320 }}
          animate={{ x: 0 }}
          exit={{ x: -320 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="hidden md:block"
        >
          <UserListSidebar
            users={filteredUsers}
            onUserClick={setSelectedUser}
            selectedUserId={selectedUser?.id}
            onSendPing={(id) => sendPing.mutate(id)}
            isPingSending={isPingSending}
            pingedByMeSet={pingedByMeSet}
          />
        </motion.div>
      )}

      {/* Main Radar Area */}
      <div className="h-[calc(100dvh-4rem)] md:h-auto md:flex-1 min-w-0 relative flex flex-col overflow-hidden">
        {/* Header */}
        <div className="relative z-20 p-2 md:p-4 bg-background/95 border-b border-border/50 w-full max-w-full flex-shrink-0">
          {/* Row 1: Title + Actions */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {!isMobile && (
                <Button variant="outline" size="icon" onClick={() => setShowSidebar(!showSidebar)} className="bg-card/80 h-8 w-8">
                  {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                </Button>
              )}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="p-1 rounded-md bg-gradient-to-br from-primary/20 to-primary/10">
                  <Radar className="h-4 w-4 text-primary" />
                </div>
                <span className="text-base md:text-xl font-bold text-foreground">Radar</span>
              </div>
              <Badge variant="outline" className="border-primary/30 text-primary bg-card/80 text-[10px] px-1.5 py-0.5">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                {onlineCount}
              </Badge>
              {/* Quantos perfis estão dentro do raio definido nos filtros */}
              <Badge
                variant="outline"
                className="border-primary/40 text-primary bg-primary/10 text-[10px] px-1.5 py-0.5 gap-0.5"
                title={`${filteredUsers.length} no raio de ${maxRadiusKm}km`}
              >
                <Radar className="h-2.5 w-2.5" />
                {filteredUsers.length}/{maxRadiusKm}km
              </Badge>
              {/* Realtime status */}
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0.5 flex-shrink-0 gap-1 bg-card/80",
                  rtStatus === "connected" && "border-emerald-500/40 text-emerald-500",
                  rtStatus === "connecting" && "border-amber-500/40 text-amber-500",
                  rtStatus === "disconnected" && "border-destructive/40 text-destructive"
                )}
                title={`Realtime: ${rtStatus} • Último update ${formatAgo(secondsSinceUpdate)}`}
              >
                {rtStatus === "disconnected" ? (
                  <WifiOff className="h-2.5 w-2.5" />
                ) : (
                  <Wifi className={cn("h-2.5 w-2.5", rtStatus === "connecting" && "animate-pulse")} />
                )}
                <span className="hidden sm:inline">
                  {rtStatus === "connected" ? "ao vivo" : rtStatus === "connecting" ? "conectando" : "offline"}
                </span>
                <span className="opacity-70">{formatAgo(secondsSinceUpdate)}</span>
              </Badge>
              {/* Fonte de localização */}
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0.5 flex-shrink-0 gap-1 bg-card/80",
                  locationSource === "gps" && "border-emerald-500/40 text-emerald-500",
                  locationSource === "profile" && "border-amber-500/40 text-amber-500",
                  locationSource === "none" && "border-destructive/40 text-destructive"
                )}
                title={
                  locationSource === "gps"
                    ? `GPS ativo${gpsCity ? ` • ${gpsCity}` : ""}${travelDistanceKm != null && travelDistanceKm >= 20 ? ` • ${Math.round(travelDistanceKm)}km do endereço de cadastro` : ""}`
                    : locationSource === "profile"
                      ? "Usando endereço de cadastro (toque em 📍 para ativar GPS)"
                      : (locationError || "Sem localização")
                }
              >
                {locationSource === "gps" ? (
                  travelDistanceKm != null && travelDistanceKm >= 20 ? (
                    <Plane className="h-2.5 w-2.5" />
                  ) : (
                    <MapPin className="h-2.5 w-2.5" />
                  )
                ) : locationSource === "profile" ? (
                  <Home className="h-2.5 w-2.5" />
                ) : (
                  <AlertCircle className="h-2.5 w-2.5" />
                )}
                <span className="hidden sm:inline">
                  {locationSource === "gps"
                    ? (gpsCity || "GPS")
                    : locationSource === "profile"
                      ? "cadastro"
                      : "sem GPS"}
                </span>
              </Badge>
            </div>

          </div>


          {/* Row 2: Looking Now + badges + última atualização GPS */}
          <div className="flex items-center gap-1.5 mt-1.5 overflow-x-auto scrollbar-hide">
            <LookingNowToggle variant="compact" />
            <LookingNowProximityIndicator count={nearbyLookingNowCount} onClick={() => setShowLookingNowOnly(true)} />
            {lookingNowCount > 0 && (
              <Badge variant="outline" className="border-orange-500/30 text-orange-500 bg-card/80 text-[10px] px-1.5 py-0.5 flex-shrink-0">
                <Flame className="h-2.5 w-2.5 mr-0.5" />
                {lookingNowCount}
              </Badge>
            )}
            {/* Última atualização GPS (distância recalculada) */}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0.5 flex-shrink-0 gap-1 bg-card/80",
                lastGpsAt ? "border-emerald-500/30 text-emerald-500" : "border-border text-muted-foreground"
              )}
              title={
                lastGpsAt
                  ? `Distância recalculada via GPS ${formatAgo(Math.max(0, Math.floor((Date.now() - lastGpsAt) / 1000)))}`
                  : "Nenhum cálculo de distância via GPS ainda"
              }
            >
              <Locate className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">GPS</span>
              <span className="opacity-80">
                {lastGpsAt
                  ? formatAgo(Math.max(0, Math.floor((Date.now() - lastGpsAt) / 1000)))
                  : "—"}
              </span>
            </Badge>

            <TooltipProvider delayDuration={300}>
              <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                <RadarPingsHistory />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="bg-card/80 h-8 w-8 relative"
                      title="Histórico de localizações"
                      aria-label="Histórico de localizações"
                    >
                      <History className="h-4 w-4" />
                      {locHistory.length > 0 && (
                        <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] px-0.5 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center">
                          {locHistory.length}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-0">
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <History className="h-3.5 w-3.5" /> Últimas localizações
                      </div>
                      {locHistory.length > 0 && (
                        <button
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => { setLocHistory([]); saveHistory([]); lastRecordedRef.current = null; }}
                        >
                          limpar
                        </button>
                      )}
                    </div>
                    {locHistory.length === 0 ? (
                      <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
                        Nenhuma localização registrada ainda.
                      </div>
                    ) : (
                      <ul className="max-h-72 overflow-y-auto divide-y divide-border">
                        {locHistory.map((h, i) => {
                          const ageSec = Math.max(0, Math.floor((Date.now() - h.ts) / 1000));
                          return (
                            <li key={`${h.ts}-${i}`} className="px-3 py-2 text-[11px] flex items-start gap-2">
                              <span className="mt-0.5">
                                {h.source === "gps" ? (
                                  <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                                ) : h.source === "profile" ? (
                                  <Home className="h-3.5 w-3.5 text-amber-500" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                                )}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium truncate">
                                    {h.source === "gps" ? (h.city || "GPS") : h.source === "profile" ? "Endereço de cadastro" : "Sem GPS"}
                                  </span>
                                  <span className="text-muted-foreground flex-shrink-0">{formatAgo(ageSec)}</span>
                                </div>
                                <div className="text-muted-foreground truncate">
                                  {h.lat.toFixed(4)}, {h.lng.toFixed(4)}
                                  {h.distanceFromHomeKm != null && h.distanceFromHomeKm >= 1 && (
                                    <span className="ml-1">• {Math.round(h.distanceFromHomeKm)} km do cadastro</span>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </PopoverContent>
                </Popover>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={() => requestLocation(true)} disabled={isLocating} className="bg-card/80 h-8 w-8">
                      <Locate className={cn("h-4 w-4", isLocating && "animate-pulse")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>Atualizar localização (alta precisão)</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefetching} className="bg-card/80 h-8 w-8" aria-label="Atualizar">
                      <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>Atualizar perfis</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={autoRefresh ? "default" : "outline"}
                      size="icon"
                      onClick={() => {
                        const next = !autoRefresh;
                        setAutoRefresh(next);
                        toast({
                          title: next ? "Auto-atualização ativada" : "Auto-atualização pausada",
                          description: next
                            ? "Localização e radar serão atualizados a cada 60s."
                            : "Atualizações automáticas pausadas.",
                        });
                      }}
                      className={cn(
                        "h-8 w-8",
                        autoRefresh
                          ? "bg-emerald-500 text-white border-0 hover:bg-emerald-600"
                          : "bg-card/80"
                      )}
                    >
                      {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{autoRefresh ? "Pausar auto-atualização (60s)" : "Ativar auto-atualização (60s)"}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>


          {/* Row 2.5: Quick filter chips (sincronizam com radar + sidebar) */}
          <div className="flex items-center gap-1.5 mt-1.5 overflow-x-auto scrollbar-hide">
            <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">Rápido:</span>
            <Button
              variant={quickVipOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setQuickVipOnly((v) => !v)}
              className={cn(
                "flex-shrink-0 h-7 text-[11px] px-2 gap-1",
                quickVipOnly
                  ? "bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-black border-0"
                  : "bg-card/80 border-border/50 hover:border-[hsl(45,93%,47%)]/50"
              )}
              title="Apenas usuários VIP"
            >
              <Crown className="h-3 w-3" />
              VIP
            </Button>
            <Button
              variant={quickOnlineOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setQuickOnlineOnly((v) => !v)}
              className={cn(
                "flex-shrink-0 h-7 text-[11px] px-2 gap-1",
                quickOnlineOnly
                  ? "bg-emerald-500 text-white border-0 hover:bg-emerald-600"
                  : "bg-card/80 border-border/50 hover:border-emerald-500/50"
              )}
              title="Apenas usuários online agora"
            >
              <Wifi className="h-3 w-3" />
              Online
            </Button>
            <Button
              variant={quickNear5Only ? "default" : "outline"}
              size="sm"
              onClick={() => setQuickNear5Only((v) => !v)}
              className={cn(
                "flex-shrink-0 h-7 text-[11px] px-2 gap-1",
                quickNear5Only
                  ? "bg-primary text-primary-foreground border-0"
                  : "bg-card/80 border-border/50 hover:border-primary/50"
              )}
              title="Apenas usuários a menos de 5km"
            >
              <MapPin className="h-3 w-3" />
              &lt; 5km
            </Button>
            {(quickVipOnly || quickOnlineOnly || quickNear5Only) && (
              <Badge variant="outline" className="border-primary/30 text-primary bg-card/80 text-[10px] px-1.5 py-0.5 flex-shrink-0">
                {filteredUsers.length} resultado{filteredUsers.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                variant={activeFilter === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(option.value)}
                className={cn(
                  "flex-shrink-0 h-7 text-xs px-2.5",
                  activeFilter === option.value
                    ? "bg-gradient-to-r from-primary to-[hsl(338,100%,50%)] text-primary-foreground border-0"
                    : "bg-card/80 border-border/50 hover:border-primary/50"
                )}
              >
                {option.label}
              </Button>
            ))}

            {/* Sort selector */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-1">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="h-7 text-[11px] px-2 bg-card/80 border-border/50 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Prioridade</SelectItem>
                  <SelectItem value="distance">Mais perto (GPS)</SelectItem>
                  <SelectItem value="age">Idade</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro: apenas usuários no raio com distância via GPS */}
            <Button
              variant={gpsOnlyInRadius ? "default" : "outline"}
              size="sm"
              onClick={() => setGpsOnlyInRadius((v) => !v)}
              disabled={locationSource !== "gps"}
              className={cn(
                "flex-shrink-0 h-7 text-[11px] px-2 gap-1",
                gpsOnlyInRadius
                  ? "bg-emerald-500 text-white border-0 hover:bg-emerald-600"
                  : "bg-card/80 border-border/50 hover:border-emerald-500/50"
              )}
              title={
                locationSource !== "gps"
                  ? "Disponível apenas com GPS ativo"
                  : gpsOnlyInRadius
                    ? "Mostrando só usuários com distância calculada por GPS"
                    : "Filtrar por distância calculada com GPS"
              }
            >
              <Locate className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Só GPS</span>
            </Button>

            {/* Reset filters */}
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="flex-shrink-0 h-7 text-[11px] px-2 bg-card/80 border-border/50 hover:border-primary/50 gap-1"
              title="Limpar filtros"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </Button>
          </div>

          {/* Row 4: Radius slider (1km – 500km) */}
          <div className="flex items-center gap-2 mt-2 w-full min-w-0 px-1">
            <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">Raio</span>
            <Slider
              value={[maxRadiusKm]}
              min={1}
              max={500}
              step={1}
              onValueChange={(v) => setMaxRadiusKm(v[0] ?? 50)}
              className="flex-1 min-w-0"
            />
            <span className="text-[10px] text-primary font-mono w-12 text-right flex-shrink-0">
              {maxRadiusKm}km
            </span>
          </div>

          {/* Row 5: Age range slider (18 – 80) */}
          <div className="flex items-center gap-2 mt-2 w-full min-w-0 px-1">
            <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">Idade</span>
            <Slider
              value={[ageRange[0], ageRange[1]]}
              min={18}
              max={80}
              step={1}
              onValueChange={(v) => {
                if (!Array.isArray(v) || v.length < 2) return;
                const lo = Math.min(v[0], v[1]);
                const hi = Math.max(v[0], v[1]);
                setAgeRange([lo, hi]);
              }}
              className="flex-1 min-w-0"
            />
            <span className="text-[10px] text-primary font-mono w-14 text-right flex-shrink-0 pointer-events-none select-none">
              {ageRange[0]}–{ageRange[1]}
            </span>
          </div>

          {/* Modo viagem: avisa quando GPS está longe do endereço de cadastro */}
          {locationSource === "gps" && travelDistanceKm != null && travelDistanceKm >= 20 && (
            <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30">
              <Plane className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
              <span className="text-[11px] text-emerald-500 leading-tight">
                Modo viagem: usando GPS real{gpsCity ? ` em ${gpsCity}` : ""} ({Math.round(travelDistanceKm)} km do endereço de cadastro). Os perfis exibidos são da sua localização atual.
              </span>
            </div>
          )}

          {/* Aviso quando GPS falhou e estamos no endereço de cadastro */}
          {locationSource === "profile" && (
            <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30">
              <Home className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-[11px] text-amber-500 leading-tight flex-1">
                Usando endereço de cadastro. Toque em <Locate className="inline h-3 w-3 -mt-0.5" /> para ativar GPS e ver perfis da sua localização atual.
                {locationError ? <span className="opacity-80"> ({locationError})</span> : null}
              </span>
            </div>
          )}

          {/* Aviso quando não há GPS algum */}
          {locationSource === "none" && (
            <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
              <span className="text-[11px] text-destructive leading-tight flex-1">
                GPS desativado. Habilite a localização do dispositivo para melhorar a precisão dos resultados. Toque em <Locate className="inline h-3 w-3 -mt-0.5" /> para tentar novamente.
                {locationError ? <span className="opacity-80"> ({locationError})</span> : null}
              </span>
            </div>
          )}
        </div>

        {/* Radar View */}
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <Radar className="h-16 w-16 text-primary animate-pulse mx-auto mb-4" />
                <p className="text-muted-foreground">Escaneando área...</p>
              </div>
            </div>
          ) : (
            <ErrorBoundary inline>
              <AbstractRadar
                users={filteredUsers}
                onUserClick={setSelectedUser}
                pingersSet={pingersSet}
                onSendPing={(id) => sendPing.mutate(id)}
                pingAnimation={pingAnimation}
                isPingSending={isPingSending}
                pingedByMeSet={pingedByMeSet}
                maxRadiusKm={maxRadiusKm}
                recentLocationHistory={locHistory}
                currentUser={profile ? {
                  id: (profile as any).id,
                  name: (profile as any).name || (profile as any).display_name || (profile as any).username || "Você",
                  avatar_url: (profile as any).avatar_url ?? null,
                } : null}
              />
            </ErrorBoundary>
          )}

          {/* Floating Buttons */}
          <AnimatePresence>
            <LuckyMatchButton
              variant="floating"
              className="bottom-40 md:bottom-20"
              candidates={filteredUsers.map((u) => ({
                id: u.id,
                name: u.name,
                avatar_url: u.avatar_url,
                bio: u.bio,
                gender: (u as any).gender ?? null,
                profile_type: u.profile_type,
                username: u.username,
              }))}
            />
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute bottom-24 md:bottom-6 right-4 z-30"
            >
              <Button
                onClick={() => setShowLookingNowOnly(!showLookingNowOnly)}
                size="lg"
                className={cn(
                  "rounded-full shadow-lg transition-all duration-300 gap-2",
                  showLookingNowOnly
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-[0_0_30px_rgba(249,115,22,0.5)]"
                    : "bg-card/90 text-foreground border border-border/50 hover:border-orange-500/50 hover:text-orange-500"
                )}
              >
                <Flame className={cn("h-5 w-5", showLookingNowOnly && "animate-pulse")} />
                {showLookingNowOnly ? "Mostrando Ativos" : "Buscando Agora"}
                {showLookingNowOnly && lookingNowCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-xs">{lookingNowCount}</span>
                )}
              </Button>
            </motion.div>
          </AnimatePresence>

          {/* User count (mobile) */}
          {isMobile && (
            <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-30">
              <Badge className="bg-card/90 text-foreground border border-border shadow-lg px-4 py-2">
                <Radar className="h-4 w-4 mr-2 text-primary" />
                {filteredUsers.length} na área
              </Badge>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredUsers.length === 0 && showEmptyState && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="relative bg-card/90 border border-border rounded-xl p-8 text-center max-w-sm mx-4 pointer-events-auto">
                <div className="absolute top-2 right-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => {
                      setShowEmptyState(false);
                      if (showLookingNowOnly) setShowLookingNowOnly(false);
                    }}
                    aria-label="Fechar"
                  >
                    <span className="text-muted-foreground text-lg">✕</span>
                  </Button>
                </div>
                {showLookingNowOnly ? (
                  <>
                    <Flame className="h-16 w-16 text-orange-500/50 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Ninguém buscando agora</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Seja o primeiro! Ative o "Buscando Agora" para aparecer para outros.
                    </p>
                    <div><LookingNowToggle /></div>
                  </>
                ) : (
                  <>
                    <Radar className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">Nenhum usuário encontrado</h3>
                    <p className="text-muted-foreground text-sm">Tente ajustar os filtros ou expandir a área de busca.</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: lista de usuários como bottom sheet expansível sobre o radar */}
      {isMobile && (
        <MobileUsersSheet
          users={filteredUsers}
          onUserClick={setSelectedUser}
          selectedUserId={selectedUser?.id}
          onSendPing={(id) => sendPing.mutate(id)}
          isPingSending={isPingSending}
          pingedByMeSet={pingedByMeSet}
        />
      )}


      <UpsellModal
        open={showUpsell}
        onOpenChange={setShowUpsell}
        restrictionType="radar"
        remainingUses={remainingRadarSearches}
        maxUses={limits.maxRadarSearchesPerDay}
      />
    </div>
  );
}
