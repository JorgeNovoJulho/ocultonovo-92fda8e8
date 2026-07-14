/**
 * Resolve coordenadas aproximadas do CENTRO DE UMA CIDADE.
 *
 * Usado como fallback quando o usuário não tem `location_lat/lng` (sem GPS),
 * mas tem `address_city` cadastrada. Permite calcular distância "Aprox." em km
 * tomando como referência o centroide da cidade.
 *
 * - Cache local persistente em `localStorage` (24h) para evitar requisições repetidas.
 * - Fonte: Nominatim (OpenStreetMap) — público e gratuito, com User-Agent obrigatório.
 * - Tolerante a falhas: retorna `null` em qualquer erro.
 */

export interface CityCenter {
  lat: number;
  lng: number;
  /** "approx" indica que é centro de cidade (não GPS real). */
  source: 'approx';
  resolvedAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const KEY = (q: string) => `city-center:${q}`;
const PENDING = new Map<string, Promise<CityCenter | null>>();

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function readCache(q: string): CityCenter | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY(q));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CityCenter;
    if (!parsed || typeof parsed.lat !== 'number') return null;
    if (Date.now() - (parsed.resolvedAt || 0) > TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(q: string, value: CityCenter): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY(q), JSON.stringify(value)); } catch {}
}

export async function geocodeCity(city: string | null | undefined, country = 'Brasil'): Promise<CityCenter | null> {
  if (!city) return null;
  const q = normalize(`${city}, ${country}`);
  const cached = readCache(q);
  if (cached) return cached;
  if (PENDING.has(q)) return PENDING.get(q)!;

  const promise = (async (): Promise<CityCenter | null> => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) return null;
      const arr = await res.json();
      const hit = Array.isArray(arr) && arr[0];
      if (!hit?.lat || !hit?.lon) return null;
      const value: CityCenter = {
        lat: parseFloat(hit.lat),
        lng: parseFloat(hit.lon),
        source: 'approx',
        resolvedAt: Date.now(),
      };
      writeCache(q, value);
      return value;
    } catch {
      return null;
    } finally {
      PENDING.delete(q);
    }
  })();

  PENDING.set(q, promise);
  return promise;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}

/* ============================================================
 * Reverse geocoding (lat,lng -> cidade aprox.)
 * Usado em UIs administrativas para mostrar a cidade derivada
 * das coordenadas cadastradas no perfil.
 * ============================================================ */
export interface ReverseCity {
  city: string | null;
  state: string | null;
  country: string | null;
  display: string;
  resolvedAt: number;
}

const REV_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const REV_KEY = (lat: number, lng: number) =>
  `rev-city:${lat.toFixed(3)},${lng.toFixed(3)}`;
const REV_PENDING = new Map<string, Promise<ReverseCity | null>>();

function readRevCache(k: string): ReverseCity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReverseCity;
    if (!parsed?.resolvedAt) return null;
    if (Date.now() - parsed.resolvedAt > REV_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeRevCache(k: string, v: ReverseCity): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

export async function reverseGeocode(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<ReverseCity | null> {
  if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) return null;
  const k = REV_KEY(Number(lat), Number(lng));
  const cached = readRevCache(k);
  if (cached) return cached;
  if (REV_PENDING.has(k)) return REV_PENDING.get(k)!;

  const promise = (async (): Promise<ReverseCity | null> => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=pt-BR`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const json = await res.json();
      const a = json?.address || {};
      const city = a.city || a.town || a.village || a.municipality || a.county || null;
      const state = a.state || a.region || null;
      const country = a.country || null;
      const display = [city, state, country].filter(Boolean).join(', ') || (json?.display_name as string) || '—';
      const value: ReverseCity = { city, state, country, display, resolvedAt: Date.now() };
      writeRevCache(k, value);
      return value;
    } catch {
      return null;
    } finally {
      REV_PENDING.delete(k);
    }
  })();

  REV_PENDING.set(k, promise);
  return promise;
}

/* ============================================================
 * Reverse geocoding detalhado (rua/bairro) — zoom alto
 * Usado no mini-mapa para mostrar endereço aproximado em tooltip.
 * ============================================================ */
export interface ReverseAddress {
  road: string | null;
  suburb: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  display: string;
  resolvedAt: number;
}

const REV_ADDR_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REV_ADDR_KEY = (lat: number, lng: number) =>
  `rev-addr:${lat.toFixed(4)},${lng.toFixed(4)}`;
const REV_ADDR_PENDING = new Map<string, Promise<ReverseAddress | null>>();

export async function reverseGeocodeAddress(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<ReverseAddress | null> {
  if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) return null;
  const k = REV_ADDR_KEY(Number(lat), Number(lng));
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        const parsed = JSON.parse(raw) as ReverseAddress;
        if (parsed?.resolvedAt && Date.now() - parsed.resolvedAt < REV_ADDR_TTL_MS) return parsed;
      }
    } catch {}
  }
  if (REV_ADDR_PENDING.has(k)) return REV_ADDR_PENDING.get(k)!;

  const promise = (async (): Promise<ReverseAddress | null> => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const json = await res.json();
      const a = json?.address || {};
      const road = a.road || a.pedestrian || a.footway || a.path || null;
      const suburb = a.suburb || a.neighbourhood || a.quarter || a.city_district || null;
      const city = a.city || a.town || a.village || a.municipality || a.county || null;
      const state = a.state || a.region || null;
      const postcode = a.postcode || null;
      const display = [road, suburb, city, state].filter(Boolean).join(', ') || (json?.display_name as string) || '—';
      const value: ReverseAddress = { road, suburb, city, state, postcode, display, resolvedAt: Date.now() };
      try { localStorage.setItem(k, JSON.stringify(value)); } catch {}
      return value;
    } catch {
      return null;
    } finally {
      REV_ADDR_PENDING.delete(k);
    }
  })();

  REV_ADDR_PENDING.set(k, promise);
  return promise;
}
