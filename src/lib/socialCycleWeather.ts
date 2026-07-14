/**
 * socialCycleWeather — adapta o Ciclo Social ao horário local e à
 * previsão do tempo (Open-Meteo, sem API key). Cacheia coords e clima
 * por algumas horas em localStorage para evitar refetch agressivo.
 */

const COORDS_KEY = 'oculto:cycle:coords';
const WEATHER_KEY = 'oculto:cycle:weather';
const COORDS_TTL = 24 * 60 * 60 * 1000; // 24h
const WEATHER_TTL = 30 * 60 * 1000; // 30 min

export type WeatherKind = 'sunny' | 'rain' | 'cold' | 'cloudy' | 'storm' | 'snow' | 'unknown';
export type DayPart = 'madrugada' | 'manha' | 'tarde' | 'noite';

export interface CycleEnv {
  hour: number;
  dayPart: DayPart;
  temp: number | null;
  weather: WeatherKind;
}

export interface CycleSuggestion {
  emoji: string;
  title: string;
  message: string;
  ctaLabel: string;
  ctaRoute: string;
  /** Slug da sala-base preferida (ex.: 'tema_livre'). Quando houver
   *  sessão especial ativa, o badge prioriza a rota direta da sala. */
  roomSlug?: string;
  /** Chave do ciclo especial preferido para esta sugestão. */
  preferredCycleKey?: string;
  hue: number;
}

function readCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; v: T };
    if (Date.now() - parsed.t > ttl) return null;
    return parsed.v;
  } catch {
    return null;
  }
}
function writeCache<T>(key: string, v: T) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* noop */ }
}

async function getCoords(): Promise<{ lat: number; lon: number } | null> {
  const cached = readCache<{ lat: number; lon: number }>(COORDS_KEY, COORDS_TTL);
  if (cached) return cached;
  if (!('geolocation' in navigator)) return null;
  return await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout);
        const v = { lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2) };
        writeCache(COORDS_KEY, v);
        resolve(v);
      },
      () => { clearTimeout(timeout); resolve(null); },
      { maximumAge: 60 * 60 * 1000, timeout: 4000 },
    );
  });
}

function weatherCodeToKind(code: number, temp: number | null): WeatherKind {
  if (code === 0 || code === 1) return temp != null && temp < 12 ? 'cold' : 'sunny';
  if (code === 2 || code === 3) return 'cloudy';
  if (code >= 45 && code <= 48) return 'cloudy';
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 95) return 'storm';
  return 'unknown';
}

function dayPartFor(hour: number): DayPart {
  if (hour >= 0 && hour < 6) return 'madrugada';
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
}

export async function getCycleEnv(): Promise<CycleEnv> {
  const hour = new Date().getHours();
  const dayPart = dayPartFor(hour);

  const cached = readCache<{ temp: number | null; weather: WeatherKind }>(WEATHER_KEY, WEATHER_TTL);
  if (cached) return { hour, dayPart, ...cached };

  const coords = await getCoords();
  if (!coords) {
    const fallback = { temp: null, weather: 'unknown' as WeatherKind };
    return { hour, dayPart, ...fallback };
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code&timezone=auto`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error('weather');
    const json = await res.json();
    const temp = Number(json?.current?.temperature_2m);
    const code = Number(json?.current?.weather_code);
    const v = {
      temp: Number.isFinite(temp) ? temp : null,
      weather: weatherCodeToKind(code, Number.isFinite(temp) ? temp : null),
    };
    writeCache(WEATHER_KEY, v);
    return { hour, dayPart, ...v };
  } catch {
    return { hour, dayPart, temp: null, weather: 'unknown' };
  }
}

/**
 * Regras explicáveis combinando horário + clima + temperatura.
 * Retorna a sugestão mais relevante.
 */
export function suggestionFor(env: CycleEnv): CycleSuggestion {
  const { hour, dayPart, temp, weather } = env;
  const hot = temp != null && temp >= 28;
  const warm = temp != null && temp >= 22 && temp < 28;
  const cold = temp != null && temp < 15;

  // Madrugada quente — sala calmaria_madrugada
  if (dayPart === 'madrugada' && (hot || warm)) {
    return {
      emoji: '🌙', title: 'Madrugada quente',
      message: 'Sala especial acordada agora — entre direto.',
      ctaLabel: 'Entrar na sala', ctaRoute: '/aura-match?room=tema_livre',
      roomSlug: 'tema_livre', preferredCycleKey: 'calmaria_madrugada', hue: 280,
    };
  }
  if (dayPart === 'madrugada') {
    return {
      emoji: '🌙', title: 'Madrugada silenciosa',
      message: 'Conexões discretas — quem está acordado também busca.',
      ctaLabel: 'Entrar na sala', ctaRoute: '/aura-match?room=tema_livre',
      roomSlug: 'tema_livre', preferredCycleKey: 'calmaria_madrugada', hue: 250,
    };
  }

  // Chuva ou tempestade — aconchego_chuvoso
  if (weather === 'rain' || weather === 'storm') {
    return {
      emoji: '🌧️', title: 'Chuva lá fora',
      message: 'Hora perfeita para um bate-papo aconchegante.',
      ctaLabel: 'Entrar na sala', ctaRoute: '/aura-match?room=tema_livre',
      roomSlug: 'tema_livre', preferredCycleKey: 'aconchego_chuvoso', hue: 200,
    };
  }

  // Frio — esquenta_frio
  if (cold || weather === 'snow') {
    return {
      emoji: '❄️', title: 'Está frio',
      message: 'Esquente o clima conhecendo alguém com os mesmos gostos.',
      ctaLabel: 'Entrar na sala', ctaRoute: '/aura-match?room=tema_livre',
      roomSlug: 'tema_livre', preferredCycleKey: 'esquenta_frio', hue: 210,
    };
  }

  // Tarde de sol — radar
  if (dayPart === 'tarde' && (hot || weather === 'sunny')) {
    return {
      emoji: '☀️', title: 'Tarde de sol',
      message: 'Energia alta na sua região — abra o radar.',
      ctaLabel: 'Abrir Radar', ctaRoute: '/radar', hue: 35,
    };
  }

  // Manhã — bom_dia_social
  if (dayPart === 'manha') {
    return {
      emoji: '🌅', title: 'Bom dia social',
      message: 'Sala matinal aberta — entre direto.',
      ctaLabel: 'Entrar na sala', ctaRoute: '/aura-match?room=tema_livre',
      roomSlug: 'tema_livre', preferredCycleKey: 'bom_dia_social', hue: 25,
    };
  }

  // Noite — pico_noite
  if (dayPart === 'noite') {
    return {
      emoji: '🌆', title: 'Noite começando',
      message: 'Sala do pico noturno — abra agora.',
      ctaLabel: 'Entrar na sala', ctaRoute: '/aura-match?room=tema_livre',
      roomSlug: 'tema_livre', preferredCycleKey: 'pico_noite', hue: 320,
    };
  }

  // Fallback
  return {
    emoji: '🌤️', title: 'Tarde social',
    message: 'Boa hora para encontrar alguém novo.',
    ctaLabel: 'Abrir sugestões', ctaRoute: '/aura-match', hue: 210,
  };
}
