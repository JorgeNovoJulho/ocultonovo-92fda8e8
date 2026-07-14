import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { calculatePriorityScore } from "@/lib/priority";

export interface RadarMapUser {
  id: string;
  user_id?: string | null;
  name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_creator: boolean;
  is_verified: boolean;
  is_verified_couple: boolean;
  is_online: boolean;
  is_seed: boolean;
  is_looking_now: boolean;
  looking_now_since: string | null;
  profile_type: string;
  gender: string | null;
  plan_type: string;
  tags_social: string[];
  tags_adult: string[];
  connection_mode: boolean;
  // Privacy-safe computed fields — NO raw lat/lng
  /** Distance from the LIVE GPS origin (used for filtering and "perto agora"). */
  distanceKm?: number;
  /** Distance from the user's REGISTERED address (used to place the bubble on the radar map). */
  displayDistanceKm?: number;
  random_angle: number; // 0-360, randomized per session to prevent triangulation
  priorityScore?: number;
  /** Computed from birth_date. Undefined when unknown or hidden by user. */
  age?: number;
  address_city?: string | null;
  address_state?: string | null;
  address_verified?: boolean | null;
  has_valid_coords?: boolean;
  gps_verified?: boolean;
  last_seen?: string | null;
  // Legacy compat — always 0 (never real coords)
  location_lat: number;
  location_lng: number;
}

type RadarOriginLocation = {
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  state?: string | null;
  verified?: boolean | null;
};

// Haversine formula
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Generate a deterministic-per-session random angle for a user.
 * Uses a simple hash of user ID + a session salt so positions change per session
 * but stay stable during the session (prevents flickering).
 */
const SESSION_SALT = Math.random() * 10000;
function getRandomAngle(userId: string): number {
  let hash = 0;
  const str = userId + SESSION_SALT.toString();
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

const FULL_COLUMNS =
  "id, user_id, name, username, avatar_url, bio, is_creator, is_verified, is_verified_couple, is_online, is_seed, is_looking_now, looking_now_since, profile_type, gender, plan_type, location_lat, location_lng, address_lat, address_lng, address_verified, is_test_account, tags_social, tags_adult, connection_mode, last_seen, birth_date, partner1_birth_date, partner2_birth_date, hide_age, address_city, address_state";

const SAFE_COLUMNS =
  "id, user_id, name, username, avatar_url, bio, is_creator, is_verified, is_verified_couple, is_online, is_seed, profile_type, gender, plan_type, location_lat, location_lng, is_test_account, tags_social, tags_adult, connection_mode, last_seen, birth_date, hide_age, address_city, address_state";

const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const BR_STATE_CODES = new Set([
  "ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg",
  "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to",
]);

const CITY_COORDS_STORAGE_KEY = "geo:city-centroids:v1";
const CITY_COORDS_CACHE = new Map<string, { lat: number; lng: number } | null>();
const CITY_COORDS_INFLIGHT = new Map<string, Promise<{ lat: number; lng: number } | null>>();
const CITY_COORDS_PRESET: Record<string, { lat: number; lng: number }> = {
  "belem|pa": { lat: -1.4558, lng: -48.4902 },
  "belo horizonte|mg": { lat: -19.9245, lng: -43.9352 },
  "brasilia|df": { lat: -15.7939, lng: -47.8828 },
  "campinas|sp": { lat: -22.9056, lng: -47.0608 },
  "curitiba|pr": { lat: -25.429, lng: -49.2671 },
  "fortaleza|ce": { lat: -3.7319, lng: -38.5267 },
  "goiania|go": { lat: -16.6869, lng: -49.2648 },
  "maceio|al": { lat: -9.6498, lng: -35.7089 },
  "manaus|am": { lat: -3.119, lng: -60.0217 },
  "porto alegre|rs": { lat: -30.0346, lng: -51.2177 },
  "quadra|sp": { lat: -23.299332, lng: -48.054657 },
  "recife|pe": { lat: -8.0476, lng: -34.877 },
  "rio de janeiro|rj": { lat: -22.9068, lng: -43.1729 },
  "salvador|ba": { lat: -12.9777, lng: -38.5016 },
  "sao luis|ma": { lat: -2.53, lng: -44.295 },
  "sao paulo|sp": { lat: -23.5505, lng: -46.6333 },
  "sorocaba|sp": { lat: -23.5015, lng: -47.4526 },
  "votorantim|sp": { lat: -23.5380539, lng: -47.4422137 },
};

function normalizeGeoToken(value?: string | null): string {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeStateCode(value?: string | null): string | null {
  const normalized = normalizeGeoToken(value).replace(/^br-/, "");
  if (!normalized || normalized.length !== 2) return null;
  return BR_STATE_CODES.has(normalized) ? normalized : null;
}

function buildCityKey(city?: string | null, state?: string | null): string {
  const normalizedCity = normalizeGeoToken(city);
  const normalizedState = normalizeStateCode(state);
  return normalizedState ? `${normalizedCity}|${normalizedState}` : normalizedCity;
}

function hasValidCoords(lat: any, lng: any) {
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

function pickRawCoords(source: Record<string, any> | RadarOriginLocation | undefined | null) {
  if (!source) return null;
  if (hasValidCoords((source as any).address_lat, (source as any).address_lng)) {
    return { lat: Number((source as any).address_lat), lng: Number((source as any).address_lng) };
  }
  if (hasValidCoords((source as any).lat, (source as any).lng)) {
    return { lat: Number((source as any).lat), lng: Number((source as any).lng) };
  }
  if (hasValidCoords((source as any).location_lat, (source as any).location_lng)) {
    return { lat: Number((source as any).location_lat), lng: Number((source as any).location_lng) };
  }
  return null;
}

function readStoredCityCoords() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(CITY_COORDS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { lat: number; lng: number } | null>;
    for (const [key, value] of Object.entries(parsed)) {
      CITY_COORDS_CACHE.set(key, value);
    }
  } catch {
    // no-op
  }
}

function persistStoredCityCoords() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CITY_COORDS_STORAGE_KEY, JSON.stringify(Object.fromEntries(CITY_COORDS_CACHE.entries())));
  } catch {
    // no-op
  }
}

async function getCityCentroid(city?: string | null, state?: string | null) {
  if (CITY_COORDS_CACHE.size === 0) {
    readStoredCityCoords();
  }

  const normalizedState = normalizeStateCode(state);
  const candidates = [
    { key: buildCityKey(city, normalizedState), queryCity: city, queryState: normalizedState?.toUpperCase() ?? null },
    { key: buildCityKey(city, null), queryCity: city, queryState: null },
  ].filter((candidate, index, arr) => candidate.key && arr.findIndex((item) => item.key === candidate.key) === index);

  for (const candidate of candidates) {
    const preset = CITY_COORDS_PRESET[candidate.key];
    if (preset) {
      CITY_COORDS_CACHE.set(candidate.key, preset);
      return preset;
    }

    if (CITY_COORDS_CACHE.has(candidate.key)) {
      const cached = CITY_COORDS_CACHE.get(candidate.key) ?? null;
      if (cached) return cached;
      continue;
    }

    if (CITY_COORDS_INFLIGHT.has(candidate.key)) {
      const inflight = await CITY_COORDS_INFLIGHT.get(candidate.key)!;
      if (inflight) return inflight;
      continue;
    }

    const promise = (async () => {
      try {
        const q = encodeURIComponent([candidate.queryCity, candidate.queryState, "Brasil"].filter(Boolean).join(" "));
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=br`, {
          headers: { "User-Agent": "OcultoSwing/1.0" },
        });
        if (!response.ok) throw new Error(`Nominatim ${response.status}`);
        const data = await response.json();
        const first = Array.isArray(data) ? data[0] : null;
        const value = first && hasValidCoords(Number(first.lat), Number(first.lon))
          ? { lat: Number(first.lat), lng: Number(first.lon) }
          : null;
        CITY_COORDS_CACHE.set(candidate.key, value);
        persistStoredCityCoords();
        return value;
      } catch {
        CITY_COORDS_CACHE.set(candidate.key, null);
        persistStoredCityCoords();
        return null;
      } finally {
        CITY_COORDS_INFLIGHT.delete(candidate.key);
      }
    })();

    CITY_COORDS_INFLIGHT.set(candidate.key, promise);
    const resolved = await promise;
    if (resolved) return resolved;
  }

  return null;
}

async function resolvePreferredLocation(source: Record<string, any> | RadarOriginLocation | undefined | null) {
  if (!source) return null;

  const raw = pickRawCoords(source);
  const city = (source as any).address_city ?? (source as any).city ?? null;
  const state = (source as any).address_state ?? (source as any).state ?? null;
  const isVerified = ((source as any).address_verified ?? (source as any).verified) === true;

  const centroid = await getCityCentroid(city, state);
  if (raw && centroid) {
    const mismatchKm = calculateDistance(raw.lat, raw.lng, centroid.lat, centroid.lng);
    if (mismatchKm > 25) {
      return { ...centroid, source: "city" as const };
    }
    return { ...raw, source: isVerified ? "precise" as const : "raw" as const };
  }

  if (centroid) {
    return { ...centroid, source: "city" as const };
  }

  if (raw) {
    return { ...raw, source: isVerified ? "precise" as const : "raw" as const };
  }

  return null;
}

export function useRadarUsers(
  userLocation?: RadarOriginLocation,
  opts?: { includeAll?: boolean; displayOrigin?: RadarOriginLocation },
) {
  const includeAll = opts?.includeAll === true;
  const displayOrigin = opts?.displayOrigin;
  // Arredonda lat/lng a 3 casas (~110m) na queryKey para evitar que pequenas
  // oscilações do GPS no mobile (watchPosition) refaçam a query do zero e
  // façam o radar "piscar/resetar".
  const round = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
  return useQuery({
    queryKey: [
      "radar-users",
      round(userLocation?.lat), round(userLocation?.lng), userLocation?.city, userLocation?.state,
      userLocation?.verified ? "verified" : "unverified",
      includeAll ? "all" : "geo",
      round(displayOrigin?.lat), round(displayOrigin?.lng),
    ],
    queryFn: async (): Promise<RadarMapUser[]> => {
      const buildQuery = (columns: string) => {
        let q: any = (supabase as any)
          .from("profiles")
          .select(columns)
          .neq("is_seed", true)
          .neq("is_test_account", true)
          .limit(500);
        if (!includeAll) {
          q = q.not("location_lat", "is", null).not("location_lng", "is", null);
        }
        return q;
      };

      let { data, error } = await buildQuery(FULL_COLUMNS);

      // Fallback: o banco externo pode não ter as colunas opcionais
      if (error && (error.code === "42703" || /does not exist/i.test(error.message ?? ""))) {
        console.warn("[Radar] coluna ausente, refazendo query simplificada:", error.message);
        const retry = await buildQuery(SAFE_COLUMNS);
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        console.error("Error fetching radar users:", error);
        throw error;
      }

      if (!data) return [];

      const now = Date.now();

      const resolvedUserLocation = await resolvePreferredLocation(userLocation);
      const userHasCoords = !!resolvedUserLocation;
      const resolvedDisplayOrigin = await resolvePreferredLocation(displayOrigin ?? userLocation);
      const displayOriginHasCoords = !!resolvedDisplayOrigin;

      const resolvedTargets = await Promise.all(
        data.map(async (profile: any) => ({
          profile,
          resolvedLocation: await resolvePreferredLocation(profile),
        })),
      );

      const users: RadarMapUser[] = resolvedTargets
        .filter(({ profile, resolvedLocation }) => includeAll || !!resolvedLocation || hasValidCoords(profile.location_lat, profile.location_lng))
        .map(({ profile, resolvedLocation }) => {
          const targetHasCoords = !!resolvedLocation;
          const rawCoords = pickRawCoords(profile);
          const hasValidLocationCoords = !!rawCoords;
          const gpsVerified = hasValidLocationCoords && !!normalizeGeoToken(profile.address_city);
          const distanceKm =
            userHasCoords && targetHasCoords
              ? calculateDistance(resolvedUserLocation!.lat, resolvedUserLocation!.lng, resolvedLocation!.lat, resolvedLocation!.lng)
              : undefined;
          const displayDistanceKm =
            displayOriginHasCoords && targetHasCoords
              ? calculateDistance(resolvedDisplayOrigin!.lat, resolvedDisplayOrigin!.lng, resolvedLocation!.lat, resolvedLocation!.lng)
              : distanceKm;

          // Online real = flag is_online E last_seen recente (3min). Evita "fantasmas" online.
          const lastSeenMs = profile.last_seen ? Date.parse(profile.last_seen) : 0;
          const seenRecently = lastSeenMs > 0 && now - lastSeenMs <= ONLINE_WINDOW_MS;
          const isOnlineReal = (profile.is_online ?? false) && seenRecently;

          const priorityScore = calculatePriorityScore({
            is_verified: profile.is_verified ?? false,
            is_verified_couple: profile.is_verified_couple ?? false,
            plan_type: profile.plan_type ?? "free",
            is_creator: profile.is_creator ?? false,
            is_seed: profile.is_seed ?? false,
            is_online: isOnlineReal,
          });

          const random_angle = getRandomAngle(profile.id);

          return {
            id: profile.id,
            user_id: profile.user_id ?? null,
            name: profile.name ?? "Usuário",
            username: profile.username ?? null,
            avatar_url: profile.avatar_url ?? null,
            bio: profile.bio ?? null,
            is_creator: profile.is_creator ?? false,
            is_verified: profile.is_verified ?? false,
            is_verified_couple: profile.is_verified_couple ?? false,
            is_online: isOnlineReal,
            is_seed: profile.is_seed ?? false,
            is_looking_now: profile.is_looking_now ?? false,
            looking_now_since: profile.looking_now_since ?? null,
            profile_type: profile.profile_type ?? "single",
            gender: profile.gender ?? null,
            plan_type: profile.plan_type ?? "free",
            location_lat: 0,
            location_lng: 0,
            tags_social: Array.isArray(profile.tags_social) ? profile.tags_social : [],
            tags_adult: Array.isArray(profile.tags_adult) ? profile.tags_adult : [],
            connection_mode: profile.connection_mode ?? true,
            distanceKm,
            displayDistanceKm,
            random_angle,
            priorityScore,
            age: profile.hide_age
              ? undefined
              : computeAge(profile.birth_date)
                ?? computeAge(profile.partner1_birth_date)
                ?? computeAge(profile.partner2_birth_date),
            address_city: profile.address_city ?? null,
            address_state: profile.address_state ?? null,
            address_verified: profile.address_verified ?? null,
            has_valid_coords: hasValidLocationCoords,
            gps_verified: gpsVerified,
            last_seen: profile.last_seen ?? null,
          };
        });

      users.sort((a, b) => {
        const priorityDiff = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
        if (priorityDiff !== 0) return priorityDiff;
        if (userLocation) {
          return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
        }
        return 0;
      });

      return users;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}

/**
 * Inscreve em mudanças realtime na tabela `profiles` para atualizar
 * o radar sem recarregar a página.
 */
export function useRadarRealtime() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);

  useEffect(() => {
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFlush = 0;
    const THROTTLE_MS = 5000;

    const scheduleInvalidate = () => {
      if (pendingTimer) return; // já agendado
      const now = Date.now();
      const wait = Math.max(0, THROTTLE_MS - (now - lastFlush));
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        lastFlush = Date.now();
        setLastUpdateAt(lastFlush);
        qc.invalidateQueries({ queryKey: ["radar-users"] });
      }, wait);
    };

    // Via bus compartilhado de `profiles` — sem callback de status próprio,
    // assume conectado assim que o handler é registrado.
    setStatus("connected");
    const unsub = subscribeTable('profiles', (payload: any) => {
      const row = payload?.new ?? payload?.old ?? {};
      if (row.is_seed === true || row.is_test_account === true) return;
      scheduleInvalidate();
    });
    return () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      unsub();
    };
  }, [qc]);

  return { status, lastUpdateAt };
}
function computeAge(dateStr?: string | null): number | undefined {
  if (!dateStr) return undefined;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return undefined;
  const diff = Date.now() - t;
  const years = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  if (years < 0 || years > 120) return undefined;
  return years;
}
