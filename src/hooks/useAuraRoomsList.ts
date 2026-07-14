import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { getCycleEnv, type CycleEnv, type WeatherKind } from '@/lib/socialCycleWeather';

export interface AuraRoomItem {
  slug: string;
  name: string;
  emoji: string | null;
  hue: number;
  description: string | null;
  vip_only: boolean;
  required_plan: string | null;
  requires_kyc: boolean;
  couple_only: boolean;
  min_aura_level: number;
  min_social_score: number;
  min_prestige_xp: number;
  hour_from: number | null;
  hour_to: number | null;
  allowed_genders: string[] | null;
  glow_intensity: number;
  sort_order: number;
  active_count: number;
  message_count: number;
  allowed: boolean;
  observer_only: boolean;
  mood?: string | null;
  tags?: string[] | null;
  rising?: boolean;
  reputation_score?: number;
  isSpecialCycle?: boolean;
  specialCycleKey?: string | null;
  specialSessionId?: string | null;
  specialClosesAt?: string | null;
}

interface SpecialCycleSessionRow {
  id: string;
  cycle_key: string;
  room_slug: string;
  opened_at: string;
  closes_at: string;
  status: 'open' | 'closing' | 'closed';
}

interface SpecialCycleDefinitionRow {
  key: string;
  label: string;
  emoji: string | null;
  hue: number;
  description: string | null;
  min_aura_level: number;
  min_social_score: number;
  min_prestige_xp: number;
  required_plan: string | null;
  requires_kyc: boolean;
  room_slug: string;
  active: boolean;
  category: string | null;
  sort_order: number | null;
  glow_intensity: number | null;
  weather_kinds: string[] | null;
  day_parts: string[] | null;
  hour_start: number | null;
  hour_end: number | null;
  days_of_week: number[] | null;
  date_month: number | null;
  date_day: number | null;
  date_start_month: number | null;
  date_start_day: number | null;
  date_end_month: number | null;
  date_end_day: number | null;
  min_temp: number | null;
  max_temp: number | null;
}

const WEATHER_ALIASES: Record<WeatherKind, string[]> = {
  sunny: ['sunny', 'clear'],
  rain: ['rain', 'drizzle'],
  cold: ['cold', 'clear', 'clouds', 'cloudy'],
  cloudy: ['cloudy', 'clouds', 'overcast'],
  storm: ['storm', 'thunderstorm'],
  snow: ['snow'],
  unknown: ['unknown'],
};

const matchesHourWindow = (hour: number, start: number | null, end: number | null) => {
  if (start == null && end == null) return true;
  if (start != null && end == null) return hour >= start;
  if (start == null && end != null) return hour < end;
  if (start === end) return true;
  if ((start ?? 0) < (end ?? 0)) return hour >= (start ?? 0) && hour < (end ?? 24);
  return hour >= (start ?? 0) || hour < (end ?? 24);
};

const matchesWeatherKinds = (expected: string[] | null | undefined, envWeather: WeatherKind) => {
  const allowed = (expected ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) return true;
  const aliases = new Set(WEATHER_ALIASES[envWeather] ?? [envWeather]);
  return allowed.some((kind) => aliases.has(kind));
};

const matchesDateRange = (
  startMonth: number | null,
  startDay: number | null,
  endMonth: number | null,
  endDay: number | null,
  now: Date,
) => {
  if (startMonth == null || startDay == null || endMonth == null || endDay == null) return true;
  const doy = (now.getMonth() + 1) * 100 + now.getDate();
  const startKey = startMonth * 100 + startDay;
  const endKey = endMonth * 100 + endDay;
  // janela que NÃO vira o ano
  if (startKey <= endKey) return doy >= startKey && doy <= endKey;
  // janela que VIRA o ano (ex.: 31/12 → 01/01)
  return doy >= startKey || doy <= endKey;
};

const isSpecialDefinitionEligible = (definition: SpecialCycleDefinitionRow, env: CycleEnv, now: Date) => {
  if (definition.active === false) return false;
  if (!matchesHourWindow(env.hour, definition.hour_start, definition.hour_end)) return false;

  const dayParts = (definition.day_parts ?? []).filter(Boolean);
  if (dayParts.length > 0 && !dayParts.includes(env.dayPart)) return false;

  const daysOfWeek = definition.days_of_week ?? [];
  if (daysOfWeek.length > 0 && !daysOfWeek.includes(now.getDay())) return false;

  // Data única (legado)
  if (definition.date_month != null && definition.date_month !== now.getMonth() + 1) return false;
  if (definition.date_day != null && definition.date_day !== now.getDate()) return false;
  // Intervalo de datas (sazonais multi-dia: Carnaval, Halloween, Réveillon...)
  if (!matchesDateRange(
    definition.date_start_month,
    definition.date_start_day,
    definition.date_end_month,
    definition.date_end_day,
    now,
  )) return false;

  if (!matchesWeatherKinds(definition.weather_kinds, env.weather)) return false;
  if (definition.min_temp != null && (env.temp == null || env.temp < definition.min_temp)) return false;
  if (definition.max_temp != null && (env.temp == null || env.temp > definition.max_temp)) return false;

  return true;
};

const compareSpecialPriority = (
  a: { session: SpecialCycleSessionRow; definition?: SpecialCycleDefinitionRow },
  b: { session: SpecialCycleSessionRow; definition?: SpecialCycleDefinitionRow },
) => {
  const bySort = (a.definition?.sort_order ?? 999) - (b.definition?.sort_order ?? 999);
  if (bySort !== 0) return bySort;
  return new Date(b.session.opened_at).getTime() - new Date(a.session.opened_at).getTime();
};

const isTemaLivre = (room: Pick<AuraRoomItem, 'slug' | 'name'>) =>
  room.slug === 'tema_livre' ||
  room.slug === 'tema-livre' ||
  (room.name || '').toLowerCase().trim() === 'tema livre';

const sortRooms = (rooms: AuraRoomItem[]) => [...rooms].sort((a, b) => {
  const temaLivreA = isTemaLivre(a) ? 0 : 1;
  const temaLivreB = isTemaLivre(b) ? 0 : 1;
  if (temaLivreA !== temaLivreB) return temaLivreA - temaLivreB;

  const specialA = a.isSpecialCycle ? 0 : 1;
  const specialB = b.isSpecialCycle ? 0 : 1;
  if (specialA !== specialB) return specialA - specialB;

  return (a.sort_order ?? 999) - (b.sort_order ?? 999);
});

const prettifyFallbackName = (slug: string) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function useAuraRoomsList(intervalMs = 60_000) {
  const [data, setData] = useState<AuraRoomItem[]>([]);
  const [loading, setLoading] = useState(true);

  const hydrateSpecialRooms = useCallback(async (rooms: AuraRoomItem[]) => {
    try {
      const { data: sessions, error: sessionsError } = await supabase
        .from('oculto_special_cycle_sessions')
        .select('id, cycle_key, room_slug, opened_at, closes_at, status')
        .in('status', ['open', 'closing'])
        .order('opened_at', { ascending: false });

      if (sessionsError || !Array.isArray(sessions) || sessions.length === 0) {
        return sortRooms(rooms);
      }

      const latestSessionBySlug = new Map<string, SpecialCycleSessionRow>();
      for (const session of sessions as SpecialCycleSessionRow[]) {
        if (!session?.room_slug || latestSessionBySlug.has(session.room_slug)) continue;
        latestSessionBySlug.set(session.room_slug, session);
      }

      const sessionRows = sessions as SpecialCycleSessionRow[];
      const cycleKeys = [...new Set(sessionRows.map((session) => session.cycle_key).filter(Boolean))];
      const definitionsByKey = new Map<string, SpecialCycleDefinitionRow>();
      const env = await Promise.race<CycleEnv | null>([
        getCycleEnv().catch(() => null),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1200)),
      ]);
      const now = new Date();

      if (cycleKeys.length > 0) {
        const { data: defs, error: defsError } = await supabase
          .from('oculto_special_cycle_definitions')
          .select('key, label, emoji, hue, description, min_aura_level, min_social_score, min_prestige_xp, required_plan, requires_kyc, room_slug, active, category, sort_order, glow_intensity, weather_kinds, day_parts, hour_start, hour_end, days_of_week, date_month, date_day, date_start_month, date_start_day, date_end_month, date_end_day, min_temp, max_temp')
          .in('key', cycleKeys);

        if (!defsError && Array.isArray(defs)) {
          for (const definition of defs as SpecialCycleDefinitionRow[]) {
            definitionsByKey.set(definition.key, definition);
          }
        }
      }

      const specialCandidates = sessionRows
        .map((session) => ({ session, definition: definitionsByKey.get(session.cycle_key) }))
        .sort(compareSpecialPriority);

      const effectiveEnv: CycleEnv = env ?? {
        hour: now.getHours(),
        dayPart: now.getHours() < 6 ? 'madrugada' : now.getHours() < 12 ? 'manha' : now.getHours() < 18 ? 'tarde' : 'noite',
        temp: null,
        weather: 'unknown',
      };

      const chosenSpecialSession = specialCandidates.find(({ definition }) => (
        !!definition && isSpecialDefinitionEligible(definition, effectiveEnv, now)
      ))?.session ?? null;

      const chosenSessionId = chosenSpecialSession?.id ?? null;

      const mergedExisting = rooms.map((room) => {
        const session = latestSessionBySlug.get(room.slug);
        if (!session || session.id !== chosenSessionId) return room;

        const definition = definitionsByKey.get(session.cycle_key);
        return {
          ...room,
          name: definition?.label ?? room.name,
          emoji: definition?.emoji ?? room.emoji,
          hue: definition?.hue ?? room.hue,
          description: definition?.description ?? room.description,
          required_plan: definition?.required_plan ?? room.required_plan,
          requires_kyc: definition?.requires_kyc ?? room.requires_kyc,
          min_aura_level: Math.max(room.min_aura_level ?? 0, definition?.min_aura_level ?? 0),
          min_social_score: Math.max(room.min_social_score ?? 0, definition?.min_social_score ?? 0),
          min_prestige_xp: Math.max(room.min_prestige_xp ?? 0, definition?.min_prestige_xp ?? 0),
          isSpecialCycle: true,
          specialCycleKey: session.cycle_key,
          specialSessionId: session.id,
          specialClosesAt: session.closes_at,
          rising: true,
          mood: room.mood ?? 'especial',
        } satisfies AuraRoomItem;
      });

      const seenSlugs = new Set(mergedExisting.map((room) => room.slug));
      const syntheticSpecialRooms: AuraRoomItem[] = [];

      for (const session of latestSessionBySlug.values()) {
        if (session.id !== chosenSessionId) continue;
        if (seenSlugs.has(session.room_slug)) continue;
        const definition = definitionsByKey.get(session.cycle_key);
        syntheticSpecialRooms.push({
          slug: session.room_slug,
          name: definition?.label ?? prettifyFallbackName(session.room_slug),
          emoji: definition?.emoji ?? '✨',
          hue: definition?.hue ?? 280,
          description: definition?.description ?? 'Sala temática especial ativa agora.',
          vip_only: (definition?.required_plan ?? '').toLowerCase() === 'vip',
          required_plan: definition?.required_plan ?? null,
          requires_kyc: !!definition?.requires_kyc,
          couple_only: false,
          min_aura_level: definition?.min_aura_level ?? 0,
          min_social_score: definition?.min_social_score ?? 0,
          min_prestige_xp: definition?.min_prestige_xp ?? 0,
          hour_from: null,
          hour_to: null,
          allowed_genders: null,
          glow_intensity: 82,
          sort_order: 1,
          active_count: 0,
          message_count: 0,
          allowed: false,
          observer_only: true,
          mood: 'especial',
          rising: true,
          reputation_score: 0,
          isSpecialCycle: true,
          specialCycleKey: session.cycle_key,
          specialSessionId: session.id,
          specialClosesAt: session.closes_at,
        });
      }

      return sortRooms([...mergedExisting, ...syntheticSpecialRooms]);
    } catch {
      return sortRooms(rooms);
    }
  }, []);

  const fetchOnce = useCallback(async () => {
    const loadBaseRooms = async () => {
      const { data: baseRows, error: baseError } = await supabase
        .from('oculto_aura_rooms')
        .select('slug, name, emoji, hue, description, vip_only, required_plan, requires_kyc, couple_only, min_aura_level, min_social_score, min_prestige_xp, hour_from, hour_to, allowed_genders, glow_intensity, sort_order, mood, tags')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (baseError) {
        console.warn('[AuraRoomsList] base rooms indisponíveis:', baseError.message ?? baseError);
        setData([]);
        setLoading(false);
        return;
      }

      const nowHour = new Date().getHours();
      const mapped = ((baseRows as any[]) ?? []).map((room) => {
        // Avaliação local conservadora: marca observer_only quando há QUALQUER gate
        // (vip_only, required_plan, requires_kyc, couple_only, mínimos > 0, janela horária,
        //  ou allowed_genders restrito). A decisão final fica no RPC `aura_rooms_list`.
        const hasGate =
          !!room.vip_only ||
          (room.required_plan && room.required_plan !== 'free') ||
          !!room.requires_kyc ||
          !!room.couple_only ||
          (room.min_aura_level ?? 0) > 0 ||
          (room.min_social_score ?? 0) > 0 ||
          (room.min_prestige_xp ?? 0) > 0 ||
          (Array.isArray(room.allowed_genders) && room.allowed_genders.length > 0) ||
          !matchesHourWindow(nowHour, room.hour_from ?? null, room.hour_to ?? null);
        return {
          ...room,
          active_count: 0,
          message_count: 0,
          allowed: !hasGate,
          observer_only: hasGate,
          mood: room.mood ?? 'calmo',
          tags: room.tags ?? [],
          rising: false,
          reputation_score: 0,
        };
      }) as AuraRoomItem[];

      setData(await hydrateSpecialRooms(mapped));
      setLoading(false);
    };

    const { data: risingRows, error: risingError } = await (supabase as any).rpc('aura_rooms_rising_now');
    const risingMap = new Map<string, { rising?: boolean; mood?: string | null }>();

    if (!risingError && Array.isArray(risingRows)) {
      (risingRows as any[]).forEach((row) => {
        if (!row?.slug) return;
        risingMap.set(row.slug, { rising: true, mood: row.mood ?? null });
      });
    }

    const { data: rows, error } = await (supabase as any).rpc('aura_rooms_list');
    if (error) {
      console.warn('[AuraRoomsList] fallback indisponível:', error.message ?? error);
      await loadBaseRooms();
      return;
    }

    // Busca tags/mood reais das salas para identificar salas "especiais"
    // (mood='especial' ou tag 'especial'). Sem isso, salas temáticas
    // aparecem como regulares quando não há ciclo ativo.
    const { data: tagRows } = await supabase
      .from('oculto_aura_rooms')
      .select('slug, mood, tags')
      .eq('active', true);
    const tagMap = new Map<string, { mood?: string | null; tags?: string[] | null }>();
    ((tagRows as any[]) ?? []).forEach((r) => {
      if (r?.slug) tagMap.set(r.slug, { mood: r.mood ?? null, tags: r.tags ?? [] });
    });

    // Contagem de mensagens nas últimas 24h por sala (destaque "curiosidade").
    const { data: msgRows } = await (supabase as any).rpc('aura_rooms_message_counts_24h');
    const msgMap = new Map<string, number>();
    ((msgRows as any[]) ?? []).forEach((r) => {
      if (r?.room_slug) msgMap.set(r.room_slug, Number(r.count_24h ?? 0));
    });

    const merged = ((rows as AuraRoomItem[]) || []).map((room) => {
      const rising = risingMap.get(room.slug);
      const meta = tagMap.get(room.slug);
      return {
        ...room,
        rising: !!(room.rising || rising?.rising),
        mood: room.mood ?? meta?.mood ?? rising?.mood ?? null,
        tags: room.tags ?? meta?.tags ?? [],
        message_count: msgMap.get(room.slug) ?? Number((room as any).message_count ?? 0),
      };
    });

    setData(await hydrateSpecialRooms(merged));
    setLoading(false);
  }, [hydrateSpecialRooms]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => { if (!cancelled) await fetchOnce(); };
    const start = () => { tick(); if (timer) window.clearInterval(timer); timer = window.setInterval(tick, intervalMs); };
    const stop = () => { if (timer) { window.clearInterval(timer); timer = null; } };
    const onVis = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVis);
    if (!document.hidden) start();
    const unsubP = subscribeTable('oculto_aura_room_presence', () => { if (!document.hidden) void fetchOnce(); });
    const unsubR = subscribeTable('oculto_aura_room_reactions', () => { if (!document.hidden) void fetchOnce(); });
    // Realtime para a própria tabela de salas — quando admin cria/edita/remove
    // uma sala, o carrossel atualiza na hora (sem precisar reload nem aguardar
    // o tick de 60s).
    const unsubRooms = subscribeTable('oculto_aura_rooms', () => { if (!document.hidden) void fetchOnce(); });
    // Realtime das mensagens — debounce simples (300ms) para não martelar em rajadas.
    let msgTimer: number | null = null;
    const scheduleMsgRefresh = () => {
      if (document.hidden) return;
      if (msgTimer) window.clearTimeout(msgTimer);
      msgTimer = window.setTimeout(() => { void fetchOnce(); }, 300);
    };
    const unsubMsgs = subscribeTable('oculto_aura_room_messages', scheduleMsgRefresh, { events: ['INSERT'] });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      stop();
      if (msgTimer) window.clearTimeout(msgTimer);
      unsubP(); unsubR(); unsubRooms(); unsubMsgs();
    };
  }, [fetchOnce, intervalMs]);


  return { data, loading, refetch: fetchOnce };
}
