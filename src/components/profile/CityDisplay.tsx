import { useState, useEffect } from "react";
import { MapPin } from "lucide-react";
import { toUF } from "@/lib/profileFormat";

interface CityDisplayProps {
  lat: number;
  lng: number;
}

// Mapeamento de fuso horário BR para estados
const TIMEZONE_CITY_MAP: Record<string, string> = {
  "America/Sao_Paulo": "São Paulo",
  "America/Manaus": "Manaus",
  "America/Belem": "Belém",
  "America/Fortaleza": "Fortaleza",
  "America/Recife": "Recife",
  "America/Maceio": "Maceió",
  "America/Bahia": "Salvador",
  "America/Campo_Grande": "Campo Grande",
  "America/Cuiaba": "Cuiabá",
  "America/Porto_Velho": "Porto Velho",
  "America/Boa_Vista": "Boa Vista",
  "America/Rio_Branco": "Rio Branco",
  "America/Noronha": "Fernando de Noronha",
};

// Cidades brasileiras com coordenadas para fallback
const BR_CITIES = [
  { name: "São Paulo, SP", lat: -23.55, lng: -46.63 },
  { name: "Rio de Janeiro, RJ", lat: -22.9, lng: -43.17 },
  { name: "Belo Horizonte, MG", lat: -19.92, lng: -43.93 },
  { name: "Brasília, DF", lat: -15.77, lng: -47.92 },
  { name: "Salvador, BA", lat: -12.97, lng: -38.51 },
  { name: "Fortaleza, CE", lat: -3.73, lng: -38.52 },
  { name: "Curitiba, PR", lat: -25.43, lng: -49.27 },
  { name: "Manaus, AM", lat: -3.1, lng: -60.02 },
  { name: "Recife, PE", lat: -8.05, lng: -34.88 },
  { name: "Porto Alegre, RS", lat: -30.03, lng: -51.22 },
  { name: "Belém, PA", lat: -1.46, lng: -48.49 },
  { name: "Goiânia, GO", lat: -16.69, lng: -49.25 },
  { name: "Campinas, SP", lat: -22.9, lng: -47.06 },
  { name: "São Luís, MA", lat: -2.53, lng: -44.3 },
  { name: "Maceió, AL", lat: -9.66, lng: -35.74 },
];

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function getNearestCity(lat: number, lng: number): string {
  let nearest = BR_CITIES[0];
  let minDist = haversineDistance(lat, lng, nearest.lat, nearest.lng);
  for (const city of BR_CITIES) {
    const d = haversineDistance(lat, lng, city.lat, city.lng);
    if (d < minDist) { minDist = d; nearest = city; }
  }
  // Converte "Cidade, UF" -> "Cidade/UF" para padronizar com toUF
  return nearest.name.replace(/,\s*/, "/");
}

export function CityDisplay({ lat, lng }: CityDisplayProps) {
  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    const cacheKey = `city_${lat.toFixed(2)}_${lng.toFixed(2)}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { setCity(cached); return; }

    // Tentar nominatim (OpenStreetMap) — gratuito e sem API key
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`,
      { headers: { "User-Agent": "OcultoSwing/1.0" } }
    )
      .then((r) => r.json())
      .then((data) => {
        const addr = data?.address;
        const name =
          addr?.city || addr?.town || addr?.village || addr?.municipality || addr?.state_district || addr?.state || getNearestCity(lat, lng);
        // Sempre normaliza para sigla UF (ex: "São Paulo" -> "SP")
        const uf = toUF(addr?.state_code || addr?.state || "");
        const label = uf ? `${name}/${uf}` : name;
        sessionStorage.setItem(cacheKey, label);
        setCity(label);
      })
      .catch(() => {
        const fallback = getNearestCity(lat, lng);
        sessionStorage.setItem(cacheKey, fallback);
        setCity(fallback);
      });
  }, [lat, lng]);

  if (!city) return null;

  return (
    <span className="text-muted-foreground flex items-center gap-1">
      <MapPin className="h-3.5 w-3.5" />
      {city}
    </span>
  );
}
