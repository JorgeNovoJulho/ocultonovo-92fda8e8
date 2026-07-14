/**
 * AddressSettings — Configuração de endereço com busca por CEP e validação por GPS
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { MapPin, Search, Loader2, Check, AlertTriangle, Navigation, CircleDashed, ShieldCheck, XCircle, History, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseExternal";

const MAX_DISTANCE_KM = 30;

const BR_STATE_NAME_TO_CODE: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function normalizeBrazilStateCode(value?: string | null) {
  const normalized = (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^br-/, "")
    .replace(/_/g, " ");

  if (!normalized) return "";
  if (/^[a-z]{2}$/.test(normalized)) {
    const upper = normalized.toUpperCase();
    if (Object.values(BR_STATE_NAME_TO_CODE).includes(upper)) return upper;
  }

  if (normalized === "sa") return "SP";
  return BR_STATE_NAME_TO_CODE[normalized] ?? "";
}

function buildAddressQuery(params: {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}) {
  return [
    [params.street?.trim(), params.number?.trim()].filter(Boolean).join(", "),
    params.neighborhood?.trim(),
    params.city?.trim(),
    normalizeBrazilStateCode(params.state) || params.state?.trim(),
    params.cep?.replace(/\D/g, "") || null,
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");
}

async function geocodeExactAddress(params: {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}) {
  const query = buildAddressQuery(params);
  if (!query || !params.city?.trim()) return null;

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br&addressdetails=1`,
    { headers: { "Accept-Language": "pt-BR", "User-Agent": "OcultoSwing/1.0" } }
  );
  if (!res.ok) throw new Error(`Falha ao geocodificar endereço (${res.status})`);
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function formatCepDisplay(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function buildGpsSummary(params: {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}) {
  const line1 = [params.street?.trim(), params.number?.trim()].filter(Boolean).join(", ");
  const line2 = [params.neighborhood?.trim(), params.city?.trim(), normalizeBrazilStateCode(params.state) || params.state?.trim()].filter(Boolean).join(", ");
  const lines = [line1, line2].filter(Boolean);

  if (params.cep?.trim()) {
    lines.push(`CEP: ${formatCepDisplay(params.cep)}`);
  }

  return lines;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type GpsStatusValue = "idle" | "requesting" | "resolving" | "captured" | "verifying" | "verified" | "failed";

/**
 * Mapeia status técnico do banco para um rótulo amigável + classe Tailwind.
 * Aceita status_detail e failure_reason opcionais (gravados pelo trigger no DB externo).
 */
export function formatAuditStatus(
  status: string | null | undefined,
  detail: string | null | undefined,
  failure: string | null | undefined,
): { label: string; detail: string; cls: string } {
  const s = (status || "").toLowerCase();
  const failureMap: Record<string, string> = {
    permission_denied: "Permissão de GPS negada pelo usuário",
    position_unavailable: "Posição GPS indisponível neste dispositivo",
    timeout: "Tempo esgotado ao buscar coordenadas",
    accuracy_low: "Precisão GPS abaixo do mínimo aceitável",
    reverse_geocode_failed: "Falha ao traduzir coordenadas em endereço",
    network_error: "Falha de rede durante a verificação",
    distance_exceeded: "Endereço informado distante demais da posição GPS",
    save_failed: "Falha ao gravar no banco — tente novamente",
  };

  if (s === "verified") return { label: "✓ Verificado", detail: detail || "Verificado por GPS e gravado para auditoria", cls: "bg-green-500/10 text-green-400 border-green-500/20" };
  if (s === "captured") return { label: "Capturado", detail: detail || "Coordenadas capturadas, aguardando confirmação", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
  if (s === "verifying" || s === "pending") return { label: "Em verificação", detail: detail || "Verificação em andamento no servidor", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  if (s === "updated") return { label: "Atualizado", detail: detail || "Coordenadas atualizadas pelo usuário", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
  if (s === "failed" || s === "error") {
    const reason = failure ? (failureMap[failure] || failure) : (detail || "Falha ao capturar localização");
    return { label: "Falhou", detail: reason, cls: "bg-destructive/10 text-destructive border-destructive/30" };
  }
  return { label: status || "—", detail: detail || "", cls: "bg-muted/40 text-muted-foreground border-border/30" };
}


function GpsStatusBadge({ status, errorMsg }: { status: GpsStatusValue; errorMsg?: string | null }) {
  if (status === "idle") return null;
  const map: Record<Exclude<GpsStatusValue, "idle">, { icon: typeof Check; label: string; cls: string }> = {
    requesting: { icon: CircleDashed, label: "Solicitando permissão de GPS…", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    resolving:  { icon: Loader2,      label: "Resolvendo endereço da posição…", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    captured:   { icon: Check,        label: "Capturado — clique em Salvar para confirmar", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    verifying:  { icon: Loader2,      label: "Em verificação no servidor…", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    verified:   { icon: ShieldCheck,  label: "Verificado por GPS e gravado para auditoria", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
    failed:     { icon: XCircle,      label: errorMsg || "Falha ao capturar localização", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  };
  const { icon: Icon, label, cls } = map[status];
  const spin = status === "resolving" || status === "verifying";
  return (
    <div className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border ${cls}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${spin ? "animate-spin" : ""}`} />
      <span className="truncate">{label}</span>
    </div>
  );
}

export function AddressSettings() {
  const { profile, updateProfile } = useProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [refreshingCard, setRefreshingCard] = useState(false);

  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const [cepLoading, setCepLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string | null>(null);
  const [cepCoords, setCepCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Estado granular do GPS para feedback visual
  type GpsStatus = "idle" | "requesting" | "resolving" | "captured" | "verifying" | "verified" | "failed";
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);

  // Histórico de capturas próprias (últimas 3) carregado da auditoria
  type AuditEntry = {
    id: string;
    captured_at: string;
    lat: number;
    lng: number;
    address_text: string | null;
    is_first_capture: boolean;
    status: string;
    status_detail?: string | null;
    failure_reason?: string | null;
  };
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);

  const profileAddressSignature = useMemo(() => JSON.stringify({
    id: profile?.id ?? null,
    street: profile?.address_street ?? null,
    number: profile?.address_number ?? null,
    complement: profile?.address_complement ?? null,
    neighborhood: profile?.address_neighborhood ?? null,
    city: profile?.address_city ?? null,
    state: profile?.address_state ?? null,
    cep: profile?.address_cep ?? null,
    addressLat: (profile as any)?.address_lat ?? null,
    addressLng: (profile as any)?.address_lng ?? null,
    locationLat: profile?.location_lat ?? null,
    locationLng: profile?.location_lng ?? null,
    verified: profile?.address_verified ?? false,
    firstGpsText: (profile as any)?.address_first_gps_text ?? null,
  }), [
    profile?.id,
    profile?.address_street,
    profile?.address_number,
    profile?.address_complement,
    profile?.address_neighborhood,
    profile?.address_city,
    profile?.address_state,
    profile?.address_cep,
    (profile as any)?.address_lat,
    (profile as any)?.address_lng,
    profile?.location_lat,
    profile?.location_lng,
    profile?.address_verified,
    (profile as any)?.address_first_gps_text,
  ]);
  const lastProfileAddressSignatureRef = useRef<string>("");

  // Sync fields when profile address data changes in DB/cache
  useEffect(() => {
    if (!profile?.id) return;
    if (lastProfileAddressSignatureRef.current === profileAddressSignature) return;
    lastProfileAddressSignatureRef.current = profileAddressSignature;

    const hasAddressData = profile.address_cep || profile.address_street || profile.address_city;
    const normalizedState = normalizeBrazilStateCode(profile.address_state) || profile.address_state || "";

    setCep(profile.address_cep || "");
    setStreet(profile.address_street || "");
    setNumber(profile.address_number || "");
    setComplement(profile.address_complement || "");
    setNeighborhood(profile.address_neighborhood || "");
    setCity(profile.address_city || "");
    setState(normalizedState);

    // Reidrata o quadro verde sempre que houver coordenadas salvas (não exige address_verified)
    const savedLat = (profile as any).address_lat ?? (profile as any).location_lat ?? null;
    const savedLng = (profile as any).address_lng ?? (profile as any).location_lng ?? null;
    if (savedLat && savedLng) {
      setGpsCoords({ lat: Number(savedLat), lng: Number(savedLng) });
      const persistedText = (profile as any).address_first_gps_text as string | undefined;
      const summary = buildGpsSummary({
        street: profile.address_street,
        number: profile.address_number,
        neighborhood: profile.address_neighborhood,
        city: profile.address_city,
        state: normalizedState,
        cep: profile.address_cep,
      });
      setGpsAddress(summary.length > 0 ? summary.join("\n") : (persistedText?.trim() || null));
      setGpsStatus(profile.address_verified ? "verified" : "captured");
    }

    // If no address text but has location coords, reverse-geocode to pre-fill fields
    if (!hasAddressData && (profile as any).location_lat && (profile as any).location_lng) {
      const lat = (profile as any).location_lat;
      const lng = (profile as any).location_lng;
      setGpsCoords({ lat, lng });

      (async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR&addressdetails=1`
          );
          const data = await res.json();
          const addr = data?.address || null;
          if (addr) {
            const resolvedState = normalizeBrazilStateCode(addr.state_code || addr.state);
            setStreet(addr.road || addr.pedestrian || addr.footway || "");
            setNeighborhood(addr.suburb || addr.neighbourhood || addr.city_district || "");
            setCity(addr.city || addr.town || addr.village || addr.municipality || "");
            setState(resolvedState);
            if (addr.postcode) setCep(addr.postcode.replace(/\D/g, ""));
          }
          const summary = addr
            ? buildGpsSummary({
                street: addr.road || addr.pedestrian || addr.footway || "",
                neighborhood: addr.suburb || addr.neighbourhood || addr.city_district || "",
                city: addr.city || addr.town || addr.village || addr.municipality || "",
                state: normalizeBrazilStateCode(addr.state_code || addr.state),
                cep: addr.postcode || "",
              })
            : buildGpsSummary({ street, number, neighborhood, city, state, cep });
          setGpsAddress(summary.join("\n"));
        } catch {
          setGpsAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        }
      })();
    }

  }, [profile, profileAddressSignature]);

  // Carrega histórico de auditoria do próprio usuário (últimas capturas)
  // Estratégia: pega a 1ª captura (sempre fixa no topo) + últimas 5 mais recentes
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const select = "id, captured_at, lat, lng, address_text, is_first_capture, status, status_detail, failure_reason";
        const fallbackSelect = "id, captured_at, lat, lng, address_text, is_first_capture, status";

        const baseQuery = (cols: string) =>
          (supabase as any)
            .from("oculto_address_gps_audit")
            .select(cols)
            .eq("profile_id", profile.id);

        // 1) primeira captura (pin no topo)
        let firstQ = await baseQuery(select).eq("is_first_capture", true).limit(1);
        if (firstQ.error?.code === "42703") firstQ = await baseQuery(fallbackSelect).eq("is_first_capture", true).limit(1);

        // 2) últimas 5 (recentes)
        let recentQ = await baseQuery(select).order("captured_at", { ascending: false }).limit(5);
        if (recentQ.error?.code === "42703") recentQ = await baseQuery(fallbackSelect).order("captured_at", { ascending: false }).limit(5);

        if (cancelled) return;

        const first = (firstQ.data || []) as AuditEntry[];
        const recent = (recentQ.data || []) as AuditEntry[];

        // Une, deduplica por id, mantém a 1ª captura SEMPRE no topo
        const seen = new Set<string>();
        const merged: AuditEntry[] = [];
        for (const row of [...first, ...recent]) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            merged.push(row);
          }
        }
        merged.sort((a, b) => {
          if (a.is_first_capture && !b.is_first_capture) return -1;
          if (!a.is_first_capture && b.is_first_capture) return 1;
          return new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime();
        });

        setAuditHistory(merged);
      } catch {
        // silencioso — auditoria é informativa, não crítica
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, gpsStatus]);

  const formatCep = (value: string) => value.replace(/\D/g, "").slice(0, 8);

  const fetchCep = useCallback(async (rawCep: string) => {
    const cleaned = rawCep.replace(/\D/g, "");
    if (cleaned.length !== 8) return;
    setCepLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.erro) {
        toast({ title: "CEP não encontrado. Preencha manualmente.", variant: "destructive" });
        return;
      }
      setStreet(data.logradouro || "");
      setNeighborhood(data.bairro || "");
      setCity(data.localidade || "");
      setState(data.uf || "");

      try {
        const geoCtrl = new AbortController();
        const geoTimeout = setTimeout(() => geoCtrl.abort(), 3000);
        const geo = await fetch(
          `https://nominatim.openstreetmap.org/search?postalcode=${cleaned}&country=BR&format=json&limit=1`,
          { headers: { "Accept-Language": "pt-BR" }, signal: geoCtrl.signal }
        );
        clearTimeout(geoTimeout);
        const geoData = await geo.json();
        if (geoData?.[0]) {
          setCepCoords({ lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) });
        }
      } catch {
        // non-blocking
      }

      toast({ title: "Endereço preenchido!", description: `${data.localidade} - ${data.uf}` });
    } catch {
      clearTimeout(timeout);
      toast({ title: "Busca de CEP falhou", description: "Preencha o endereço manualmente.", variant: "destructive" });
    } finally {
      setCepLoading(false);
    }
  }, [toast]);

  const handleGetGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus("failed");
      setGpsErrorMsg("GPS não disponível neste dispositivo");
      toast({ title: "GPS não disponível neste dispositivo", variant: "destructive" });
      return;
    }
    setGpsLoading(true);
    setGpsErrorMsg(null);
    setGpsStatus("requesting");
    // Mantém o quadro verde anterior visível durante a recaptura;
    // só será atualizado quando a nova posição chegar.
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsCoords(coords);
        setGpsLoading(false);
        setGpsStatus("resolving");

        // Reverse geocode to show human-readable address
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&accept-language=pt-BR`
          );
          const data = await res.json();
          const addr = data?.address || {};
          const resolvedState = normalizeBrazilStateCode(addr.state_code || addr.state) || normalizeBrazilStateCode(state) || state;
          const reverseSummary = buildGpsSummary({
            street: addr.road || addr.pedestrian || addr.footway || street,
            number: addr.house_number || number,
            neighborhood: addr.suburb || addr.neighbourhood || addr.city_district || neighborhood,
            city: addr.city || addr.town || addr.village || addr.municipality || city,
            state: resolvedState,
            cep: addr.postcode || cep,
          });
          const manualSummary = buildGpsSummary({ street, number, neighborhood, city, state: resolvedState, cep });

          // Normalização automática: SEMPRE sobrescreve com o que o reverse-geocode retornar,
          // garantindo Rua/Número/Bairro/Cidade/Estado consistentes no card.
          const newStreet = addr.road || addr.pedestrian || addr.footway || street;
          const newNumber = addr.house_number || number;
          const newNeighborhood = addr.suburb || addr.neighbourhood || addr.city_district || neighborhood;
          const newCity = addr.city || addr.town || addr.village || addr.municipality || city;
          const newCep = (addr.postcode || cep || "").replace(/\D/g, "");
          if (newStreet) setStreet(newStreet);
          if (newNumber) setNumber(newNumber);
          if (newNeighborhood) setNeighborhood(newNeighborhood);
          if (newCity) setCity(newCity);
          if (resolvedState) setState(resolvedState);
          if (newCep) setCep(newCep);

          setGpsAddress((manualSummary.length > 0 ? manualSummary : reverseSummary).join("\n"));
        } catch {
          setGpsAddress(`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
        }

        setGpsStatus("captured");
        toast({ title: "✅ Localização GPS obtida!", description: "Sua posição foi capturada. Clique em Salvar para confirmar." });
      },
      (err) => {
        setGpsLoading(false);
        setGpsStatus("failed");
        setGpsErrorMsg(err.message || "Falha ao obter localização");
        toast({ title: "Erro de GPS", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [toast, street, number, neighborhood, city, state, cep]);

  const handleRefreshCard = useCallback(async () => {
    if (refreshingCard) return;
    setRefreshingCard(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      await queryClient.refetchQueries({ queryKey: ["profile", user?.id] });
      // Também recalcula distâncias no Radar/Pesquisar imediatamente
      queryClient.invalidateQueries({ queryKey: ["radar-users"] });
      queryClient.invalidateQueries({ queryKey: ["pesquisar"] });
      toast({ title: "✅ Cartão de endereço atualizado!" });
    } catch (e: any) {
      toast({ title: "Falha ao atualizar", description: e?.message || "Tente novamente", variant: "destructive" });
    } finally {
      setRefreshingCard(false);
    }
  }, [queryClient, user?.id, toast, refreshingCard]);

  const handleSave = async () => {
    if (!street || !city || !state || !cep.replace(/\D/g, "")) {
      toast({ title: "Preencha os campos obrigatórios", description: "Rua, Cidade, Estado e CEP são necessários.", variant: "destructive" });
      return;
    }

    const normalizedState = normalizeBrazilStateCode(state) || state.toUpperCase().slice(0, 2);
    const addressSummary = buildGpsSummary({
      street,
      number,
      neighborhood,
      city,
      state: normalizedState,
      cep,
    });

    let exactAddressCoords: { lat: number; lng: number } | null = null;
    try {
      exactAddressCoords = await geocodeExactAddress({
        street,
        number,
        neighborhood,
        city,
        state: normalizedState,
        cep,
      });
    } catch {
      exactAddressCoords = null;
    }

    const referenceCoords = exactAddressCoords || cepCoords;
    if (gpsCoords && referenceCoords) {
      const dist = haversineKm(gpsCoords.lat, gpsCoords.lng, referenceCoords.lat, referenceCoords.lng);
      if (dist > MAX_DISTANCE_KM) {
        toast({
          title: "Endereço muito distante da sua localização",
          description: `O endereço informado está ${dist.toFixed(0)} km de distância. Máximo permitido: ${MAX_DISTANCE_KM} km.`,
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);
    if (gpsCoords) setGpsStatus("verifying");
    // Optimistic: show success immediately
    toast({ title: "✅ Salvando endereço..." });

    try {
      const addressCoords = exactAddressCoords || cepCoords || gpsCoords || null;

      const updatePayload: Record<string, any> = {
          address_street: street,
          address_number: number || null,
          address_complement: complement || null,
          address_neighborhood: neighborhood,
          address_city: city,
          address_state: normalizedState,
          address_cep: cep.replace(/\D/g, ""),
        };

      if (gpsCoords) {
        updatePayload.location_lat = gpsCoords.lat;
        updatePayload.location_lng = gpsCoords.lng;
      } else if (addressCoords) {
        updatePayload.location_lat = addressCoords.lat;
        updatePayload.location_lng = addressCoords.lng;
      }

      if (addressCoords) {
        updatePayload.address_lat = addressCoords.lat;
        updatePayload.address_lng = addressCoords.lng;
      }
      if (gpsCoords) {
        updatePayload.address_verified = true;
        // Auditoria: primeira captura GPS (trigger no DB protege contra sobrescrita)
        updatePayload.address_first_gps_lat = gpsCoords.lat;
        updatePayload.address_first_gps_lng = gpsCoords.lng;
        updatePayload.address_first_gps_captured_at = new Date().toISOString();
        updatePayload.address_first_gps_text = addressSummary.join("\n") || null;
      }

      const { persistProfileForUser } = await import("@/lib/profilePersistence");
      const authUser = (await supabase.auth.getUser()).data.user;
      const uid = authUser?.id || (profile as any)?.user_id || profile?.id;
      if (!uid) throw new Error("Usuário não autenticado");

      const result = await persistProfileForUser(uid, updatePayload, {
        identifiers: [profile?.id, (profile as any)?.user_id, (profile as any)?.username].filter(Boolean) as string[],
      });
      if (result.removedColumns.length > 0) {
        console.warn("[AddressSettings] Colunas inexistentes ignoradas:", result.removedColumns);
      }
      if (addressCoords) setGpsCoords(addressCoords);
      if (addressSummary.length > 0) setGpsAddress(addressSummary.join("\n"));
      setState(normalizedState);
      updateProfile(updatePayload as any);
      if (gpsCoords) setGpsStatus("verified");
      // Recarrega o cartão imediatamente, sem reload da página
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      queryClient.refetchQueries({ queryKey: ["profile", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["radar-users"] });
      queryClient.invalidateQueries({ queryKey: ["pesquisar"] });
      toast({
        title: "✅ Endereço salvo!",
        description: gpsCoords
          ? "Verificado por GPS. Cartão atualizado."
          : "Salvo. Ative o GPS para melhor precisão.",
      });
    } catch (err: any) {
      if (gpsCoords) setGpsStatus("failed");
      setGpsErrorMsg(err?.message || null);
      // Never reset form — keep user data intact
      toast({ title: "Erro ao salvar", description: `${err.message || "Tente novamente."}`, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const distanceKm = gpsCoords && cepCoords
    ? haversineKm(gpsCoords.lat, gpsCoords.lng, cepCoords.lat, cepCoords.lng)
    : null;

  const isVerified = profile?.address_verified;

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Endereço
          {isVerified && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] ml-1">
              <Check className="h-2.5 w-2.5 mr-1" />
              Verificado
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Seu endereço é usado como base para cálculos de distância no Radar e busca de perfis próximos.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* CEP */}
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="cep">CEP *</Label>
            <div className="relative">
              <Input
                id="cep"
                value={cep}
                onChange={(e) => setCep(formatCep(e.target.value))}
                onBlur={() => fetchCep(cep)}
                placeholder="00000000"
                maxLength={8}
                className="bg-muted/30 border-border/50 pr-10"
              />
              {cepLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchCep(cep)}
              disabled={cepLoading || cep.replace(/\D/g, "").length !== 8}
              className="h-10 gap-1.5"
            >
              <Search className="h-3.5 w-3.5" />
              Buscar
            </Button>
          </div>
        </div>

        {/* Street + Number */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="street">Rua / Logradouro *</Label>
            <Input
              id="street"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Rua das Flores"
              className="bg-muted/30 border-border/50"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="number">Número</Label>
            <Input
              id="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="123"
              className="bg-muted/30 border-border/50"
            />
          </div>
        </div>

        {/* Complement + Neighborhood */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="complement">Complemento</Label>
            <Input
              id="complement"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              placeholder="Apto 42"
              className="bg-muted/30 border-border/50"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="neighborhood">Bairro</Label>
            <Input
              id="neighborhood"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Centro"
              className="bg-muted/30 border-border/50"
            />
          </div>
        </div>

        {/* City + State */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="city">Cidade *</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="São Paulo"
              className="bg-muted/30 border-border/50"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="state">Estado *</Label>
            <Input
              id="state"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="SP"
              maxLength={2}
              className="bg-muted/30 border-border/50"
            />
          </div>
        </div>

        {/* GPS verification */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <Navigation className="h-4 w-4 text-green-400" />
                Confirmação por GPS
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Necessário para habilitar o Radar e calcular distâncias precisas.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGetGPS}
              disabled={gpsLoading || gpsStatus === "verifying"}
              className={gpsCoords ? "border-green-500/50 text-green-400 hover:bg-green-500/10" : ""}
            >
              {gpsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : gpsCoords ? (
                <><Check className="h-4 w-4 mr-1" /> GPS OK</>
              ) : (
                <><Navigation className="h-4 w-4 mr-1" /> Usar GPS</>
              )}
            </Button>
          </div>

          {/* Status indicator */}
          <GpsStatusBadge status={gpsStatus} errorMsg={gpsErrorMsg} />

          {/* GPS resolved address shown below button */}
          {gpsCoords && (
            <div className="flex items-start gap-2 text-xs p-2 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">
              <MapPin className="h-3.5 w-3.5 mt-1 shrink-0" />
              <div className="flex flex-col gap-0.5">
                {(gpsAddress
                  ? gpsAddress.split("\n").filter(Boolean)
                  : buildGpsSummary({
                      street,
                      number,
                      neighborhood,
                      city,
                      state,
                      cep,
                    })
                ).map((line, index) => (
                  <span
                    key={`${line}-${index}`}
                    className={index === 0 ? "leading-relaxed font-medium" : "text-green-400/90 leading-relaxed"}
                  >
                    {line}
                  </span>
                ))}
                <span className="text-green-400/70 font-mono">
                  {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}
                </span>
              </div>
            </div>
          )}

          {/* Distance indicator */}
          {distanceKm !== null && (
            <div className={`flex items-center gap-2 text-xs p-2 rounded-md ${distanceKm <= MAX_DISTANCE_KM ? "bg-green-500/10 text-green-400" : "bg-destructive/10 text-destructive"}`}>
              {distanceKm <= MAX_DISTANCE_KM ? (
                <Check className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              )}
              {distanceKm <= MAX_DISTANCE_KM
                ? `Endereço confirmado — ${distanceKm.toFixed(1)} km da sua posição GPS`
                : `Endereço muito distante — ${distanceKm.toFixed(0)} km (máx. ${MAX_DISTANCE_KM} km)`}
            </div>
          )}

          {/* Histórico das últimas capturas (próprio usuário) */}
          {auditHistory.length > 0 && (
            <div className="mt-1 rounded-md border border-border/30 bg-background/40">
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border/20">
                <History className="h-3 w-3" />
                Histórico recente das suas capturas
              </div>
              <ul className="text-[11px] divide-y divide-border/20">
                {auditHistory.map((h) => {
                  const statusInfo = formatAuditStatus(h.status, h.status_detail, h.failure_reason);
                  return (
                    <li
                      key={h.id}
                      className={`px-2 py-1.5 flex items-start justify-between gap-2 ${
                        h.is_first_capture ? "bg-primary/5 border-l-2 border-l-primary" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span>{new Date(h.captured_at).toLocaleString("pt-BR")}</span>
                          {h.is_first_capture && (
                            <span className="px-1 py-px rounded text-[9px] bg-primary/15 text-primary border border-primary/20 font-semibold">
                              ⭐ 1ª captura
                            </span>
                          )}
                          <span
                            className={`px-1 py-px rounded text-[9px] border ${statusInfo.cls}`}
                            title={statusInfo.detail}
                          >
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="text-foreground/80 truncate">
                          {h.address_text || `${h.lat.toFixed(5)}, ${h.lng.toFixed(5)}`}
                        </div>
                        {statusInfo.detail && statusInfo.detail !== statusInfo.label && (
                          <div className="text-[10px] text-muted-foreground/70 truncate" title={statusInfo.detail}>
                            {statusInfo.detail}
                          </div>
                        )}
                      </div>
                      <span className="text-muted-foreground/60 font-mono text-[10px] shrink-0">
                        {h.lat.toFixed(4)},{h.lng.toFixed(4)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : (
              <><Check className="h-4 w-4" /> Salvar Endereço</>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="sm:w-auto gap-2"
            onClick={handleRefreshCard}
            disabled={refreshingCard}
            title="Recarrega o cartão de endereço sem precisar atualizar a página"
          >
            {refreshingCard ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Atualizando...</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Atualizar cartão</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
