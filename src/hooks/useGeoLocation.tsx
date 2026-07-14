import { useState, useEffect, useRef } from "react";

interface GeoLocationData {
  city: string | null;
  region: string | null;
  country: string | null;
  isLoading: boolean;
  error: string | null;
}

// Cidades brasileiras para rotação dinâmica
const BRAZILIAN_CITIES = [
  "São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Porto Alegre",
  "Salvador", "Brasília", "Fortaleza", "Recife", "Goiânia",
  "Campinas", "Manaus", "Belém", "Florianópolis", "Vitória",
  "Santos", "Ribeirão Preto", "Sorocaba", "Uberlândia", "Joinville",
  "Natal", "João Pessoa", "Maceió", "Aracaju", "Teresina",
  "Campo Grande", "Cuiabá", "Londrina", "Maringá", "Blumenau"
];

// Free IP geolocation service
const GEO_API_URL = "https://ipapi.co/json/";

// Gera uma cidade aleatória inicial
function getRandomCity(): string {
  return BRAZILIAN_CITIES[Math.floor(Math.random() * BRAZILIAN_CITIES.length)];
}

export function useGeoLocation(enabled: boolean = true, fallbackCity: string = "sua cidade"): GeoLocationData & { displayCity: string } {
  const [data, setData] = useState<GeoLocationData>({
    city: null,
    region: null,
    country: null,
    isLoading: true,
    error: null
  });
  
  // Cidade rotativa para fallback - sempre roda, mas só é usada se não tiver city real
  const [rotatingCity, setRotatingCity] = useState(getRandomCity);
  const indexRef = useRef(Math.floor(Math.random() * BRAZILIAN_CITIES.length));

  // Rotação de cidades a cada 8 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % BRAZILIAN_CITIES.length;
      setRotatingCity(BRAZILIAN_CITIES[indexRef.current]);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    // Check localStorage cache first (valid for 1 hour)
    const cached = localStorage.getItem('geo_location_cache');
    if (cached) {
      try {
        const { data: cachedData, timestamp } = JSON.parse(cached);
        const isValid = Date.now() - timestamp < 1000 * 60 * 60; // 1 hour
        if (isValid && cachedData.city) {
          setData({
            city: cachedData.city,
            region: cachedData.region,
            country: cachedData.country,
            isLoading: false,
            error: null
          });
          return;
        }
      } catch {
        localStorage.removeItem('geo_location_cache');
      }
    }

    const fetchLocation = async () => {
      try {
        const response = await fetch(GEO_API_URL, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch location');
        }

        const result = await response.json();
        
        const locationData = {
          city: result.city || null,
          region: result.region || null,
          country: result.country_name || null
        };

        // Cache the result
        localStorage.setItem('geo_location_cache', JSON.stringify({
          data: locationData,
          timestamp: Date.now()
        }));

        setData({
          ...locationData,
          isLoading: false,
          error: null
        });
      } catch (error) {
        console.warn('Geo location fetch failed:', error);
        setData({
          city: null,
          region: null,
          country: null,
          isLoading: false,
          error: 'Failed to detect location'
        });
      }
    };

    fetchLocation();
  }, [enabled]);

  // Usa cidade real se disponível, senão usa rotação, senão fallback
  const displayCity = data.city || rotatingCity || fallbackCity;

  return {
    ...data,
    displayCity
  };
}

// Simple hook for just getting the city with override support
export function useDisplayCity(
  enabled: boolean = true, 
  fallbackCity: string = "sua cidade",
  cityOverride?: string | null
): string {
  const { displayCity } = useGeoLocation(enabled && !cityOverride, fallbackCity);
  return cityOverride || displayCity;
}
